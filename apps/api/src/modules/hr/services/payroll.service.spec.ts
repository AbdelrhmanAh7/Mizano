import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../prisma/prisma.service';
import { PayrollService } from './payroll.service';
import { Decimal } from '@prisma/client/runtime/library';
import { createMockPrisma } from '../../../test/mocks/prisma.mock';

describe('PayrollService (payslips cross-tenant scoping)', () => {
  let service: PayrollService;
  let findFirstEmployee: jest.Mock;
  let findManyPayslip: jest.Mock;
  let findFirstPayslip: jest.Mock;

  const orgA = 'org-tenant-a';
  const employeeId = 'emp-123';
  const payslipId = 'ps-456';

  beforeEach(async () => {
    findFirstEmployee = jest.fn();
    findManyPayslip = jest.fn();
    findFirstPayslip = jest.fn();

    const mockPrisma = {
      employee: {
        findFirst: findFirstEmployee,
      },
      payslip: {
        findFirst: findFirstPayslip,
        findMany: findManyPayslip,
      },
      payrollRun: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [PayrollService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    service = module.get<PayrollService>(PayrollService);
  });

  describe('getEmployeePayslips', () => {
    it('throws NotFoundException when employee belongs to another organization (cross-tenant 404)', async () => {
      // Employee not found in orgA because they belong to orgB
      findFirstEmployee.mockResolvedValue(null);

      await expect(service.getEmployeePayslips(orgA, employeeId)).rejects.toThrow(
        NotFoundException,
      );

      expect(findFirstEmployee).toHaveBeenCalledWith({
        where: { id: employeeId, organizationId: orgA, deletedAt: null },
        select: { id: true },
      });
      expect(findManyPayslip).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when employee is soft-deleted', async () => {
      findFirstEmployee.mockResolvedValue(null);

      await expect(service.getEmployeePayslips(orgA, employeeId)).rejects.toThrow(
        new NotFoundException('Employee not found'),
      );
    });

    it('returns payslips scoped to caller organization when employee exists in tenant', async () => {
      findFirstEmployee.mockResolvedValue({ id: employeeId });
      const mockPayslips = [
        {
          id: 'ps-1',
          employeeId,
          payrollRun: { month: 1, year: 2026, status: 'PROCESSED' },
        },
      ];
      findManyPayslip.mockResolvedValue(mockPayslips);

      const result = await service.getEmployeePayslips(orgA, employeeId);

      expect(findFirstEmployee).toHaveBeenCalledWith({
        where: { id: employeeId, organizationId: orgA, deletedAt: null },
        select: { id: true },
      });
      expect(findManyPayslip).toHaveBeenCalledWith({
        where: {
          employeeId,
          payrollRun: { organizationId: orgA },
        },
        orderBy: { payrollRun: { year: 'desc' } },
        include: { payrollRun: { select: { month: true, year: true, status: true } } },
      });
      expect(result).toEqual(mockPayslips);
    });
  });

  describe('getPayslip', () => {
    it('throws NotFoundException when payslip belongs to another organization (cross-tenant 404)', async () => {
      // Query scoped by payrollRun: { organizationId: orgA } returns null for orgB payslip
      findFirstPayslip.mockResolvedValue(null);

      await expect(service.getPayslip(orgA, payslipId)).rejects.toThrow(NotFoundException);

      expect(findFirstPayslip).toHaveBeenCalledWith({
        where: {
          id: payslipId,
          payrollRun: { organizationId: orgA },
          employee: { deletedAt: null },
        },
        include: {
          employee: true,
          payrollRun: true,
        },
      });
    });

    it('returns 404 for a soft-deleted employee', async () => {
      findFirstPayslip.mockImplementation(async ({ where }) =>
        where.employee?.deletedAt === null && where.payrollRun.organizationId === orgA
          ? null
          : { employee: { deletedAt: new Date() } },
      );
      await expect(service.getPayslip(orgA, payslipId)).rejects.toThrow(NotFoundException);
    });

    it('returns payslip when it belongs to caller organization', async () => {
      const mockPayslip = {
        id: payslipId,
        payrollRun: { organizationId: orgA },
        employee: { id: employeeId },
      };
      findFirstPayslip.mockResolvedValue(mockPayslip);

      const result = await service.getPayslip(orgA, payslipId);

      expect(findFirstPayslip).toHaveBeenCalledWith({
        where: {
          id: payslipId,
          payrollRun: { organizationId: orgA },
          employee: { deletedAt: null },
        },
        include: {
          employee: true,
          payrollRun: true,
        },
      });
      expect(result).toEqual(mockPayslip);
    });
  });
});

describe('PayrollService.calculatePayroll (Decimal arithmetic)', () => {
  const setup = (
    employee: { basicSalary: string; allowances: object; deductions: object },
    attendance: Array<{ status: 'PRESENT' | 'HALF_DAY' }>,
  ) => {
    const prisma = createMockPrisma();
    prisma.payrollRun.findFirst.mockResolvedValue({
      id: 'run-1',
      month: 3,
      year: 2026,
      status: 'DRAFT',
    } as never);
    prisma.employee.findMany.mockResolvedValue([
      { id: 'emp-1', ...employee, basicSalary: new Decimal(employee.basicSalary) },
    ] as never);
    prisma.attendance.findMany.mockResolvedValue(attendance as never);
    prisma.payslip.create.mockResolvedValue({ id: 'slip-1' } as never);
    const service = new PayrollService(prisma as unknown as PrismaService);
    jest.spyOn(service, 'getPayrollRun').mockResolvedValue({ id: 'run-1' } as never);
    return { prisma, service };
  };
  const full = (n: number) => Array.from({ length: n }, () => ({ status: 'PRESENT' as const }));

  it('computes a full month exactly: 5000 + 500 allowance, 100 deduction, 15% tax', async () => {
    const { prisma, service } = setup(
      { basicSalary: '5000.0000', allowances: { housing: 500 }, deductions: { insurance: 100 } },
      full(22),
    );

    const result = await service.calculatePayroll('org-a', 'run-1');

    expect(prisma.employee.findMany).toHaveBeenCalledWith({
      where: { organizationId: 'org-a', isActive: true, deletedAt: null },
    });
    const slip = prisma.payslip.create.mock.calls[0][0].data;
    expect(String(slip.grossSalary)).toBe('5500');
    expect(String(slip.taxes)).toBe('825');
    expect(String(slip.netSalary)).toBe('4575');
    expect(String(slip.lop)).toBe('0');
    const totals = prisma.payrollRun.update.mock.calls[0][0].data;
    expect(String(totals.totalGross)).toBe('5500');
    expect(String(totals.totalNet)).toBe('4575');
    expect(String(totals.totalDeductions)).toBe('925');
    expect(totals.totalGross).toBeInstanceOf(Decimal);
    expect(result.payslipsCreated).toBe(1);
    expect(String(result.totalGross)).toBe('5500');
  });

  it('prorates fractional days without float drift and rounds every line to 4 places', async () => {
    // 1000 x 7.5 / 22 = 340.909090... -> 340.9091; tax 15% = 51.136365 -> 51.1364 (half up)
    const { prisma, service } = setup(
      { basicSalary: '1000.0000', allowances: {}, deductions: {} },
      [...full(7), { status: 'HALF_DAY' }],
    );

    await service.calculatePayroll('org-a', 'run-1');

    const slip = prisma.payslip.create.mock.calls[0][0].data;
    expect(String(slip.grossSalary)).toBe('340.9091');
    expect(String(slip.lop)).toBe('659.0909');
    expect(String(slip.taxes)).toBe('51.1364');
    expect(String(slip.netSalary)).toBe('289.7727');
    const totals = prisma.payrollRun.update.mock.calls[0][0].data;
    expect(String(totals.totalGross)).toBe('340.9091');
    expect(String(totals.totalNet)).toBe('289.7727');
    expect(String(totals.totalDeductions)).toBe('51.1364');
  });

  it('ignores non-numeric allowance values instead of failing', async () => {
    const { prisma, service } = setup(
      { basicSalary: '220.0000', allowances: { a: '10.5', b: 'n/a', c: null }, deductions: {} },
      full(22),
    );

    await service.calculatePayroll('org-a', 'run-1');

    expect(String(prisma.payslip.create.mock.calls[0][0].data.grossSalary)).toBe('230.5');
  });
});
