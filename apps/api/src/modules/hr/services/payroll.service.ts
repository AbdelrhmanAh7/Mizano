import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { PayrollStatus } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

@Injectable()
export class PayrollService {
  constructor(private prisma: PrismaService) {}

  async createPayrollRun(organizationId: string, dto: { month: number; year: number }) {
    // Check for existing payroll run for this month/year
    const existing = await this.prisma.payrollRun.findFirst({
      where: {
        organizationId,
        month: dto.month,
        year: dto.year,
      },
    });
    if (existing) throw new BadRequestException('Payroll run already exists for this period');

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
      const allowancesJson = employee.allowances as Record<string, number> || {};
      const totalAllowances = Object.values(allowancesJson).reduce((sum: number, val: number) => sum + (val || 0), 0);

      // Get deductions from employee profile (JSON field)
      const deductionsJson = employee.deductions as Record<string, number> || {};
      const totalEmployeeDeductions = Object.values(deductionsJson).reduce((sum: number, val: number) => sum + (val || 0), 0);

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
    const payrollRun = await this.prisma.payrollRun.findFirst({
      where: { id: payrollRunId, organizationId },
    });
    if (!payrollRun) throw new NotFoundException('Payroll run not found');
    if (payrollRun.status !== PayrollStatus.PROCESSED) {
      throw new BadRequestException('Payroll must be processed before marking as paid');
    }

    return this.prisma.payrollRun.update({
      where: { id: payrollRunId },
      data: {
        status: PayrollStatus.PAID,
        paidAt: new Date(),
      },
    });
  }

  async getPayrollRuns(organizationId: string, query: { status?: string; year?: number }) {
    const where: any = { organizationId };
    if (query.status) where.status = query.status;
    if (query.year) where.year = query.year;

    return this.prisma.payrollRun.findMany({
      where,
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
      include: {
        _count: { select: { payslips: true } },
      },
    });
  }

  async getPayrollRun(organizationId: string, id: string) {
    const payrollRun = await this.prisma.payrollRun.findFirst({
      where: { id, organizationId },
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

  async getPayslip(organizationId: string, id: string) {
    const payslip = await this.prisma.payslip.findFirst({
      where: { id },
      include: {
        employee: true,
        payrollRun: true,
      },
    });
    if (!payslip) throw new NotFoundException('Payslip not found');
    // Verify organization through payroll run
    if (payslip.payrollRun.organizationId !== organizationId) {
      throw new NotFoundException('Payslip not found');
    }
    return payslip;
  }

  async getEmployeePayslips(organizationId: string, employeeId: string) {
    return this.prisma.payslip.findMany({
      where: { employeeId },
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
    await this.prisma.payrollRun.delete({ where: { id } });
    return { message: 'Payroll run deleted' };
  }
}
