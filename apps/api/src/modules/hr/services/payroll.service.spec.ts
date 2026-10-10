import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PayrollStatus } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { dec } from '../../../test/helpers/decimal.helpers';
import {
  expectBalanced,
  realJournalsService,
  writtenJournals,
} from '../../../test/helpers/ledger.helpers';
import { createMockPrisma, MockPrismaClient } from '../../../test/mocks/prisma.mock';
import { JournalsService } from '../../accounting/services/journals.service';
import { PayrollService } from './payroll.service';

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
      providers: [
        PayrollService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: JournalsService, useValue: {} },
      ],
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
          deletedAt: null,
          payrollRun: { organizationId: orgA, deletedAt: null },
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
          deletedAt: null,
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
          deletedAt: null,
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

describe('PayrollService postings (#130)', () => {
  const ORG = 'org-1';
  const run = {
    id: 'run-1',
    month: 8,
    year: 2026,
    status: PayrollStatus.PROCESSED,
    totalGross: dec('787.88'),
    totalNet: dec('569.45'),
    totalDeductions: dec('218.43'),
    organizationId: ORG,
  };
  let prisma: MockPrismaClient;

  function serviceWithLock(lockDate: Date | null = null): PayrollService {
    return new PayrollService(
      prisma as unknown as PrismaService,
      realJournalsService(prisma, lockDate),
    );
  }

  beforeEach(() => {
    prisma = createMockPrisma();
    prisma.payrollRun.findFirst.mockResolvedValue(run as never);
    prisma.payrollRun.updateMany.mockResolvedValue({ count: 1 });
    prisma.account.findFirst.mockImplementation((({ where }: { where: { type: string } }) =>
      Promise.resolve({ id: `acc-${where.type}` })) as never);
  });

  it('posts one balanced PAYROLL journal dated on the period end', async () => {
    await serviceWithLock().markAsPaid(ORG, run.id);

    const [journal, ...rest] = writtenJournals(prisma);
    expect(rest).toHaveLength(0);
    expectBalanced(journal.lines);
    expect(journal.sourceType).toBe('PAYROLL');
    expect(journal.sourceId).toBe(run.id);
    expect(journal.date.toISOString()).toBe('2026-08-31T00:00:00.000Z');
    expect(prisma.payrollRun.update).toHaveBeenCalledWith({
      where: { id: run.id },
      data: { journalId: 'journal-new' },
    });
  });

  it('rejects the posting when the lock date covers the payroll period', async () => {
    const service = serviceWithLock(new Date('2026-08-31T00:00:00.000Z'));

    await expect(service.markAsPaid(ORG, run.id)).rejects.toThrow(/locked/);
    expect(prisma.journal.create).not.toHaveBeenCalled();
  });

  it('rejects a concurrent second payment without posting', async () => {
    prisma.payrollRun.updateMany.mockResolvedValue({ count: 0 });

    await expect(serviceWithLock().markAsPaid(ORG, run.id)).rejects.toThrow(ConflictException);
    expect(prisma.journal.create).not.toHaveBeenCalled();
  });

  it('refuses to post deductions without a payroll liability account', async () => {
    prisma.account.findFirst.mockImplementation((({ where }: { where: { type: string } }) =>
      Promise.resolve(where.type === 'LIABILITY' ? null : { id: `acc-${where.type}` })) as never);

    await expect(serviceWithLock().markAsPaid(ORG, run.id)).rejects.toThrow(BadRequestException);
    expect(prisma.journal.create).not.toHaveBeenCalled();
  });

  it('computes payslips in Decimal so gross = net + deductions exactly', async () => {
    prisma.payrollRun.findFirst.mockResolvedValue({ ...run, status: PayrollStatus.DRAFT } as never);
    prisma.employee.findMany.mockResolvedValue([
      {
        id: 'emp-1',
        basicSalary: dec('10000'),
        allowances: { housing: 333.33 },
        deductions: { loan: 100.25 },
      },
    ] as never);
    prisma.attendance.findMany.mockResolvedValue([
      { status: 'PRESENT' },
      { status: 'HALF_DAY' },
    ] as never);

    const result = await serviceWithLock().calculatePayroll(ORG, run.id);

    const slip = prisma.payslip.create.mock.calls[0][0].data;
    // 10000 x 1.5 / 22 = 681.818... -> 681.82; + 333.33 = 1015.15; tax 15% = 152.27 (rounded)
    expect(String(slip.grossSalary)).toBe('1015.15');
    expect(String(slip.taxes)).toBe('152.27');
    expect(String(slip.netSalary)).toBe('762.63');
    expect(
      dec(String(slip.netSalary))
        .add(dec('100.25'))
        .add(dec(String(slip.taxes))),
    ).toEqual(dec('1015.15'));
    const totals = prisma.payrollRun.update.mock.calls[0][0].data;
    expect(dec(String(totals.totalNet)).add(dec(String(totals.totalDeductions)))).toEqual(
      dec(String(totals.totalGross)),
    );
    expect(result.totalGross).toBe('1015.1500');
  });
});
