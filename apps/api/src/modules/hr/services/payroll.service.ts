import {
  ConflictException,
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, PayrollStatus } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../../../prisma/prisma.service';
import { lockOrganizationLedger } from '../../../common/utils/ledger-lock';

@Injectable()
export class PayrollService {
  constructor(private prisma: PrismaService) {}

  async createPayrollRun(organizationId: string, dto: { month: number; year: number }) {
    // Check for existing confirmed/paid payroll run for this month/year
    const existing = await this.prisma.payrollRun.findFirst({
      where: {
        organizationId,
        month: dto.month,
        year: dto.year,
        status: { in: [PayrollStatus.PROCESSED, PayrollStatus.PAID] },
      },
    });
    if (existing) throw new BadRequestException('Payroll run already exists for this period');

    // Delete any existing DRAFT run for this period before creating a new one
    await this.prisma.payrollRun.deleteMany({
      where: {
        organizationId,
        month: dto.month,
        year: dto.year,
        status: PayrollStatus.DRAFT,
      },
    });

    return this.prisma.payrollRun.create({
      data: {
        month: dto.month,
        year: dto.year,
        status: PayrollStatus.DRAFT,
        organizationId,
      },
    });
  }

  async calculatePayroll(organizationId: string, payrollRunId: string) {
    const payrollRun = await this.prisma.payrollRun.findFirst({
      where: { id: payrollRunId, organizationId },
    });
    if (!payrollRun) throw new NotFoundException('Payroll run not found');
    if (payrollRun.status !== PayrollStatus.DRAFT) {
      throw new BadRequestException('Payroll already processed');
    }

    // Get all active employees
    const employees = await this.prisma.employee.findMany({
      where: { organizationId, isActive: true },
    });

    const payslips = [];
    let totalGross = 0;
    let totalNet = 0;
    let totalDeductions = 0;

    // Calculate period dates from month/year
    const periodStart = new Date(payrollRun.year, payrollRun.month - 1, 1);
    const periodEnd = new Date(payrollRun.year, payrollRun.month, 0);

    for (const employee of employees) {
      // Calculate working days in period
      const attendance = await this.prisma.attendance.findMany({
        where: {
          employeeId: employee.id,
          organizationId,
          date: { gte: periodStart, lte: periodEnd },
          status: { in: ['PRESENT', 'HALF_DAY'] },
        },
      });

      const daysWorked = attendance.reduce((sum, a) => {
        if (a.status === 'HALF_DAY') return sum + 0.5;
        return sum + 1;
      }, 0);

      // Calculate salary
      const basicSalary = parseFloat(employee.basicSalary.toString());

      // Get allowances from employee profile (JSON field)
      const allowancesJson = (employee.allowances as Record<string, number>) || {};
      const totalAllowances = Object.values(allowancesJson).reduce(
        (sum: number, val: number) => sum + (val || 0),
        0,
      );

      // Get deductions from employee profile (JSON field)
      const deductionsJson = (employee.deductions as Record<string, number>) || {};
      const totalEmployeeDeductions = Object.values(deductionsJson).reduce(
        (sum: number, val: number) => sum + (val || 0),
        0,
      );

      // Prorate based on days worked
      const workingDaysInMonth = 22;
      const proratedSalary = (basicSalary / workingDaysInMonth) * daysWorked;

      // Calculate LOP (Loss of Pay)
      const lop = basicSalary - proratedSalary;

      const grossSalary = proratedSalary + totalAllowances;

      // Calculate tax (simplified - 15% tax rate)
      const taxRate = 0.15;
      const taxes = grossSalary * taxRate;

      const netSalary = grossSalary - totalEmployeeDeductions - taxes;

      const payslip = await this.prisma.payslip.create({
        data: {
          employeeId: employee.id,
          payrollRunId,
          basicSalary: new Decimal(basicSalary),
          allowances: allowancesJson,
          grossSalary: new Decimal(grossSalary),
          lop: new Decimal(lop),
          deductions: deductionsJson,
          taxes: new Decimal(taxes),
          netSalary: new Decimal(netSalary),
        },
      });

      payslips.push(payslip);
      totalGross += grossSalary;
      totalNet += netSalary;
      totalDeductions += totalEmployeeDeductions + taxes;
    }

    // Update payroll run with totals
    await this.prisma.payrollRun.update({
      where: { id: payrollRunId },
      data: {
        totalGross: new Decimal(totalGross),
        totalNet: new Decimal(totalNet),
        totalDeductions: new Decimal(totalDeductions),
        status: PayrollStatus.PROCESSED,
        processedAt: new Date(),
      },
    });

    return {
      payrollRun: await this.getPayrollRun(organizationId, payrollRunId),
      payslipsCreated: payslips.length,
      totalGross,
      totalNet,
    };
  }

  async markAsPaid(organizationId: string, payrollRunId: string) {
    return this.prisma.$transaction(async (tx) => {
      await lockOrganizationLedger(tx, organizationId);
      const payrollRun = await tx.payrollRun.findFirst({
        where: { id: payrollRunId, organizationId, deletedAt: null },
      });
      if (!payrollRun) throw new NotFoundException('Payroll run not found');
      if (payrollRun.status !== PayrollStatus.PROCESSED) {
        throw new BadRequestException('Payroll must be processed before marking as paid');
      }

      const totalGross = payrollRun.totalGross;
      const totalNet = payrollRun.totalNet;
      const totalDeductions = payrollRun.totalDeductions;

      // Find salary expense account (EXPENSE type, name containing "Salary" or "Wages")
      const salaryAccount = await tx.account.findFirst({
        where: {
          organizationId,
          type: 'EXPENSE',
          isActive: true,
          OR: [
            { name: { contains: 'Salary', mode: 'insensitive' } },
            { name: { contains: 'Wages', mode: 'insensitive' } },
            { code: { startsWith: '5' } },
          ],
        },
      });

      // Find cash/bank account (ASSET type)
      const cashAccount = await tx.account.findFirst({
        where: {
          organizationId,
          type: 'ASSET',
          isActive: true,
          OR: [
            { name: { contains: 'Cash', mode: 'insensitive' } },
            { name: { contains: 'Bank', mode: 'insensitive' } },
            { code: { startsWith: '1' } },
          ],
        },
      });

      if (!salaryAccount || !cashAccount) {
        throw new BadRequestException(
          'Salary expense and cash/bank accounts must be configured before marking payroll as paid',
        );
      }

      // Create payroll journal entry
      const journalNumber = await this.generateJournalNumber(tx, organizationId);

      const journalLines: Array<{
        accountId: string;
        debit: Decimal;
        credit: Decimal;
        description: string;
      }> = [];

      // Debit: Salary Expense (gross amount)
      journalLines.push({
        accountId: salaryAccount.id,
        debit: totalGross,
        credit: new Decimal(0),
        description: `Salary expense - ${payrollRun.month}/${payrollRun.year}`,
      });

      // Credit: Cash/Bank (net amount paid to employees)
      journalLines.push({
        accountId: cashAccount.id,
        debit: new Decimal(0),
        credit: totalNet,
        description: `Salary payment - ${payrollRun.month}/${payrollRun.year}`,
      });

      // Credit: Tax/Deductions payable (if deductions > 0)
      if (totalDeductions.greaterThan(0)) {
        // Try to find a tax payable / liability account
        const liabilityAccount = await tx.account.findFirst({
          where: {
            organizationId,
            type: 'LIABILITY',
            isActive: true,
            OR: [
              { name: { contains: 'Tax', mode: 'insensitive' } },
              { name: { contains: 'Payable', mode: 'insensitive' } },
              { code: { startsWith: '2' } },
            ],
          },
        });

        if (liabilityAccount) {
          journalLines.push({
            accountId: liabilityAccount.id,
            debit: new Decimal(0),
            credit: totalDeductions,
            description: `Payroll deductions/taxes - ${payrollRun.month}/${payrollRun.year}`,
          });
        } else {
          // If no liability account, credit the full gross to cash
          journalLines[1].credit = totalGross;
          journalLines.splice(2); // Remove the deductions line
        }
      }

      const journal = await tx.journal.create({
        data: {
          journalNumber,
          date: new Date(),
          reference: `PAY-${String(payrollRun.month).padStart(2, '0')}-${payrollRun.year}`,
          notes: `Payroll for ${payrollRun.month}/${payrollRun.year}`,
          isPosted: true,
          organizationId,
          sourceType: 'PAYROLL_PAYMENT',
          sourceId: payrollRunId,
          lines: { create: journalLines },
        },
      });

      // Guard the transition as well as the snapshot; a failed guard rolls the journal back.
      const transition = await tx.payrollRun.updateMany({
        where: {
          id: payrollRunId,
          organizationId,
          deletedAt: null,
          status: PayrollStatus.PROCESSED,
        },
        data: { status: PayrollStatus.PAID },
      });
      if (transition.count !== 1) throw new ConflictException('Payroll status changed');

      // Update payroll run
      return tx.payrollRun.update({
        where: { id: payrollRunId, organizationId, status: PayrollStatus.PAID },
        data: {
          status: PayrollStatus.PAID,
          paidAt: new Date(),
          journalId: journal.id,
        },
      });
    });
  }

  private async generateJournalNumber(
    tx: {
      journal: {
        findFirst: (args: {
          where: { organizationId: string };
          orderBy: { createdAt: 'desc' };
          select: { journalNumber: true };
        }) => Promise<{ journalNumber: string } | null>;
      };
    },
    organizationId: string,
  ): Promise<string> {
    const lastJournal = await tx.journal.findFirst({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      select: { journalNumber: true },
    });

    if (!lastJournal?.journalNumber) {
      return 'JRN-001';
    }

    const lastNumber = parseInt(lastJournal.journalNumber.split('-')[1], 10);
    return `JRN-${String(lastNumber + 1).padStart(3, '0')}`;
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
      where: { id, payrollRun: { organizationId }, employee: { deletedAt: null } },
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
        payrollRun: { organizationId },
      },
      orderBy: { payrollRun: { year: 'desc' } },
      include: { payrollRun: { select: { month: true, year: true, status: true } } },
    });
  }

  async deletePayrollRun(organizationId: string, id: string) {
    const payrollRun = await this.prisma.payrollRun.findFirst({
      where: { id, organizationId },
    });
    if (!payrollRun) throw new NotFoundException('Payroll run not found');
    if (payrollRun.status === PayrollStatus.PAID) {
      throw new BadRequestException('Cannot delete paid payroll');
    }

    await this.prisma.payslip.deleteMany({ where: { payrollRunId: id } });
    await this.prisma.payrollRun.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    return { message: 'Payroll run deleted' };
  }

  // === Bulk Operations ===

  async bulkDelete(organizationId: string, ids: string[]) {
    // Delete payslips first, then soft-delete runs
    await this.prisma.payslip.deleteMany({
      where: {
        payrollRun: { id: { in: ids }, organizationId, status: { not: PayrollStatus.PAID } },
      },
    });
    const result = await this.prisma.payrollRun.updateMany({
      where: {
        id: { in: ids },
        organizationId,
        status: { not: PayrollStatus.PAID },
        deletedAt: null,
      },
      data: { deletedAt: new Date() },
    });
    return { deleted: result.count, total: ids.length };
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
