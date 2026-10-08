import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, PayrollStatus } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { round } from '../../../common/utils/document-totals';
import { PrismaService } from '../../../prisma/prisma.service';
import { JournalSourceType, JournalsService } from '../../accounting/services/journals.service';

const WORKING_DAYS_IN_MONTH = 22;
/** Simplified flat income tax on gross pay. */
const TAX_RATE = new Decimal('0.15');

/** Sum of an employee's allowance/deduction map ({ name: amount }) at currency scale. */
function sumAmounts(json: Prisma.JsonValue): Decimal {
  const values =
    json && typeof json === 'object' && !Array.isArray(json) ? Object.values(json) : [];
  return round(
    values.reduce<Decimal>((s, v) => s.add(new Decimal(String(v ?? 0))), new Decimal(0)),
  );
}

@Injectable()
export class PayrollService {
  constructor(
    private prisma: PrismaService,
    private journalsService: JournalsService,
  ) {}

  async createPayrollRun(organizationId: string, dto: { month: number; year: number }) {
    const existing = await this.prisma.payrollRun.findFirst({
      where: { organizationId, month: dto.month, year: dto.year },
    });
    if (existing && existing.status !== PayrollStatus.DRAFT) {
      throw new BadRequestException('Payroll run already exists for this period');
    }
    // A draft has no payslips or journal: reuse (and restore) it instead of deleting it.
    if (existing) {
      return this.prisma.payrollRun.update({
        where: { id: existing.id },
        data: { deletedAt: null },
      });
    }

    return this.prisma.payrollRun.create({
      data: {
        month: dto.month,
        year: dto.year,
        status: PayrollStatus.DRAFT,
        organizationId,
      },
    });
  }

  /**
   * Computes every payslip in Decimal, rounding each amount to currency scale; net pay absorbs the rounding
   * so gross = net + deductions holds exactly per payslip and for the run totals.
   */
  async calculatePayroll(organizationId: string, payrollRunId: string) {
    const payrollRun = await this.prisma.payrollRun.findFirst({
      where: { id: payrollRunId, organizationId, deletedAt: null },
    });
    if (!payrollRun) throw new NotFoundException('Payroll run not found');
    if (payrollRun.status !== PayrollStatus.DRAFT) {
      throw new BadRequestException('Payroll already processed');
    }

    const periodStart = new Date(Date.UTC(payrollRun.year, payrollRun.month - 1, 1));
    const nextPeriodStart = new Date(Date.UTC(payrollRun.year, payrollRun.month, 1));

    const totals = await this.prisma.$transaction(async (tx) => {
      // Claim the draft first so a concurrent calculation cannot create payslips twice.
      const { count } = await tx.payrollRun.updateMany({
        where: { id: payrollRunId, organizationId, status: PayrollStatus.DRAFT, deletedAt: null },
        data: { status: PayrollStatus.PROCESSED, processedAt: new Date() },
      });
      if (count === 0) throw new ConflictException('Payroll already processed');

      const employees = await tx.employee.findMany({
        where: { organizationId, isActive: true, deletedAt: null },
      });

      let totalGross = new Decimal(0);
      let totalNet = new Decimal(0);
      let totalDeductions = new Decimal(0);

      for (const employee of employees) {
        const attendance = await tx.attendance.findMany({
          where: {
            employeeId: employee.id,
            organizationId,
            date: { gte: periodStart, lt: nextPeriodStart },
            status: { in: ['PRESENT', 'HALF_DAY'] },
          },
          select: { status: true },
        });
        const daysWorked = attendance.reduce(
          (sum, a) => sum.add(a.status === 'HALF_DAY' ? '0.5' : '1'),
          new Decimal(0),
        );

        const basicSalary = employee.basicSalary;
        const proratedSalary = round(basicSalary.mul(daysWorked).div(WORKING_DAYS_IN_MONTH));
        const lop = basicSalary.sub(proratedSalary);
        const grossSalary = proratedSalary.add(sumAmounts(employee.allowances));
        const employeeDeductions = sumAmounts(employee.deductions);
        const taxes = round(grossSalary.mul(TAX_RATE));
        const deductions = employeeDeductions.add(taxes);
        const netSalary = grossSalary.sub(deductions);

        await tx.payslip.create({
          data: {
            employeeId: employee.id,
            payrollRunId,
            basicSalary,
            allowances: employee.allowances ?? {},
            grossSalary,
            lop,
            deductions: employee.deductions ?? {},
            taxes,
            totalDeductions: deductions,
            netSalary,
          },
        });

        totalGross = totalGross.add(grossSalary);
        totalNet = totalNet.add(netSalary);
        totalDeductions = totalDeductions.add(deductions);
      }

      await tx.payrollRun.update({
        where: { id: payrollRunId },
        data: { totalGross, totalNet, totalDeductions },
      });
      return { payslipsCreated: employees.length, totalGross, totalNet };
    });

    return {
      payrollRun: await this.getPayrollRun(organizationId, payrollRunId),
      payslipsCreated: totals.payslipsCreated,
      totalGross: totals.totalGross.toFixed(4),
      totalNet: totals.totalNet.toFixed(4),
    };
  }

  /**
   * Posts the payroll journal through the ledger command, dated on the last day of the payroll
   * month and linked to the run (PAYROLL:runId), so a repeated or concurrent call posts once and
   * a locked period is rejected.
   */
  async markAsPaid(organizationId: string, payrollRunId: string) {
    const payrollRun = await this.prisma.payrollRun.findFirst({
      where: { id: payrollRunId, organizationId, deletedAt: null },
    });
    if (!payrollRun) throw new NotFoundException('Payroll run not found');
    if (payrollRun.status !== PayrollStatus.PROCESSED) {
      throw new BadRequestException('Payroll must be processed before marking as paid');
    }

    const period = `${payrollRun.month}/${payrollRun.year}`;
    const periodEnd = new Date(Date.UTC(payrollRun.year, payrollRun.month, 0));

    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.payrollRun.updateMany({
        where: {
          id: payrollRunId,
          organizationId,
          status: PayrollStatus.PROCESSED,
          deletedAt: null,
        },
        data: { status: PayrollStatus.PAID, paidAt: new Date() },
      });
      if (count === 0) throw new ConflictException('Payroll run has already been paid');

      const { totalGross, totalNet, totalDeductions } = payrollRun;
      if (totalGross.isZero()) {
        return tx.payrollRun.findUniqueOrThrow({ where: { id: payrollRunId } });
      }

      // Find salary expense account (EXPENSE type, name containing "Salary" or "Wages")
      const salaryAccount = await tx.account.findFirst({
        where: {
          organizationId,
          type: 'EXPENSE',
          isActive: true,
          deletedAt: null,
          OR: [
            { name: { contains: 'Salary', mode: 'insensitive' } },
            { name: { contains: 'Wages', mode: 'insensitive' } },
            { code: { startsWith: '5' } },
          ],
        },
        orderBy: { code: 'asc' },
      });

      // Find cash/bank account (ASSET type)
      const cashAccount = await tx.account.findFirst({
        where: {
          organizationId,
          type: 'ASSET',
          isActive: true,
          deletedAt: null,
          OR: [
            { name: { contains: 'Cash', mode: 'insensitive' } },
            { name: { contains: 'Bank', mode: 'insensitive' } },
            { code: { startsWith: '1' } },
          ],
        },
        orderBy: { code: 'asc' },
      });

      // Deductions and taxes are owed to third parties until remitted.
      const liabilityAccount = totalDeductions.greaterThan(0)
        ? await tx.account.findFirst({
            where: {
              organizationId,
              type: 'LIABILITY',
              isActive: true,
              deletedAt: null,
              OR: [
                { name: { contains: 'Payroll', mode: 'insensitive' } },
                { name: { contains: 'Tax', mode: 'insensitive' } },
                { name: { contains: 'Payable', mode: 'insensitive' } },
              ],
            },
            orderBy: { code: 'asc' },
          })
        : null;

      if (!salaryAccount || !cashAccount || (totalDeductions.greaterThan(0) && !liabilityAccount)) {
        throw new BadRequestException(
          'Salary expense, cash/bank and payroll liability accounts must be configured before marking payroll as paid',
        );
      }

      const lines = [
        {
          accountId: salaryAccount.id,
          debit: totalGross.toFixed(4),
          credit: '0',
          description: `Salary expense - ${period}`,
        },
        {
          accountId: cashAccount.id,
          debit: '0',
          credit: totalNet.toFixed(4),
          description: `Salary payment - ${period}`,
        },
        ...(liabilityAccount
          ? [
              {
                accountId: liabilityAccount.id,
                debit: '0',
                credit: totalDeductions.toFixed(4),
                description: `Payroll deductions/taxes - ${period}`,
              },
            ]
          : []),
      ].filter((line) => !new Decimal(line.debit).add(line.credit).isZero());

      const journal = await this.journalsService.create(
        organizationId,
        {
          date: periodEnd.toISOString(),
          reference: `PAY-${String(payrollRun.month).padStart(2, '0')}-${payrollRun.year}`,
          notes: `Payroll for ${period}`,
          lines,
        },
        { tx, source: { type: JournalSourceType.PAYROLL, id: payrollRunId } },
      );

      return tx.payrollRun.update({
        where: { id: payrollRunId },
        data: { journalId: journal.id },
      });
    });
  }

  async getPayrollRuns(
    organizationId: string,
    query: {
      status?: string;
      year?: number;
      page?: number;
      limit?: number;
      sortBy?: string;
      sortOrder?: string;
    },
  ) {
    const where: Prisma.PayrollRunWhereInput = { organizationId, deletedAt: null };
    if (query.status) where.status = query.status as PayrollStatus;
    if (query.year) where.year = Number(query.year);

    const page = Number(query.page ?? 1);
    const limit = Number(query.limit ?? 20);
    const sortBy = query.sortBy ?? 'createdAt';
    const sortOrder = (query.sortOrder ?? 'desc') as 'asc' | 'desc';

    const [data, total] = await Promise.all([
      this.prisma.payrollRun.findMany({
        where,
        orderBy: { [sortBy]: sortOrder },
        include: { _count: { select: { payslips: true } } },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.payrollRun.count({ where }),
    ]);

    return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async getPayrollRun(organizationId: string, id: string) {
    const payrollRun = await this.prisma.payrollRun.findFirst({
      where: { id, organizationId, deletedAt: null },
      include: {
        payslips: {
          where: { deletedAt: null },
          include: {
            employee: { select: { id: true, name: true, employeeId: true } },
          },
        },
      },
    });
    if (!payrollRun) throw new NotFoundException('Payroll run not found');
    return payrollRun;
  }

  async getPayslip(
    organizationId: string,
    id: string,
  ): Promise<
    Prisma.PayslipGetPayload<{
      include: {
        employee: true;
        payrollRun: true;
      };
    }>
  > {
    const payslip = await this.prisma.payslip.findFirst({
      where: {
        id,
        deletedAt: null,
        payrollRun: { organizationId },
        employee: { deletedAt: null },
      },
      include: {
        employee: true,
        payrollRun: true,
      },
    });
    if (!payslip) throw new NotFoundException('Payslip not found');
    return payslip;
  }

  async getEmployeePayslips(
    organizationId: string,
    employeeId: string,
  ): Promise<
    Prisma.PayslipGetPayload<{
      include: { payrollRun: { select: { month: true; year: true; status: true } } };
    }>[]
  > {
    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, organizationId, deletedAt: null },
      select: { id: true },
    });
    if (!employee) {
      throw new NotFoundException('Employee not found');
    }

    return this.prisma.payslip.findMany({
      where: {
        employeeId: employee.id,
        deletedAt: null,
        payrollRun: { organizationId, deletedAt: null },
      },
      orderBy: { payrollRun: { year: 'desc' } },
      include: { payrollRun: { select: { month: true, year: true, status: true } } },
    });
  }

  async deletePayrollRun(organizationId: string, id: string) {
    const payrollRun = await this.prisma.payrollRun.findFirst({
      where: { id, organizationId, deletedAt: null },
    });
    if (!payrollRun) throw new NotFoundException('Payroll run not found');
    if (payrollRun.status === PayrollStatus.PAID) {
      throw new BadRequestException('Cannot delete paid payroll');
    }

    await this.softDeleteRuns(organizationId, [id]);
    return { message: 'Payroll run deleted' };
  }

  // === Bulk Operations ===

  async bulkDelete(organizationId: string, ids: string[]) {
    const deleted = await this.softDeleteRuns(organizationId, ids);
    return { deleted, total: ids.length };
  }

  /** Soft-deletes unpaid runs and their payslips together; paid runs are left untouched. */
  private async softDeleteRuns(organizationId: string, ids: string[]): Promise<number> {
    const deletedAt = new Date();
    return this.prisma.$transaction(async (tx) => {
      const runs = await tx.payrollRun.findMany({
        where: {
          id: { in: ids },
          organizationId,
          status: { not: PayrollStatus.PAID },
          deletedAt: null,
        },
        select: { id: true },
      });
      const runIds = runs.map((r) => r.id);
      await tx.payslip.updateMany({
        where: { payrollRunId: { in: runIds }, deletedAt: null },
        data: { deletedAt },
      });
      const result = await tx.payrollRun.updateMany({
        where: { id: { in: runIds }, status: { not: PayrollStatus.PAID }, deletedAt: null },
        data: { deletedAt },
      });
      return result.count;
    });
  }

  async bulkProcess(organizationId: string, ids: string[]) {
    let processed = 0;
    for (const id of ids) {
      try {
        await this.calculatePayroll(organizationId, id);
        processed++;
      } catch {
        // Skip runs that can't be processed
      }
    }
    return { processed, total: ids.length };
  }

  async bulkMarkPaid(organizationId: string, ids: string[]) {
    let paid = 0;
    for (const id of ids) {
      try {
        await this.markAsPaid(organizationId, id);
        paid++;
      } catch {
        // Skip runs that can't be marked as paid
      }
    }
    return { paid, total: ids.length };
  }
}
