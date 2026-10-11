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

  it('counts attendance inside the payroll month in local time, as AttendanceService stores it', async () => {
    prisma.payrollRun.findFirst.mockResolvedValue({ ...run, status: PayrollStatus.DRAFT } as never);
    prisma.employee.findMany.mockResolvedValue([
      { id: 'emp-1', basicSalary: dec('10000'), allowances: {}, deductions: {} },
    ] as never);
    prisma.attendance.findMany.mockResolvedValue([] as never);

    await serviceWithLock().calculatePayroll(ORG, run.id);

    // Days are kept at local midnight: a UTC month would drop the 1st on a server ahead of UTC.
    expect(prisma.attendance.findMany.mock.calls[0][0]?.where?.date).toEqual({
      gte: new Date(2026, 7, 1),
      lt: new Date(2026, 8, 1),
    });
  });

  it('never marks a zero-gross run paid without a journal', async () => {
    prisma.payrollRun.findFirst.mockResolvedValue({
      ...run,
      totalGross: dec('0'),
      totalNet: dec('0'),
      totalDeductions: dec('0'),
    } as never);

    await expect(serviceWithLock().markAsPaid(ORG, run.id)).rejects.toThrow(BadRequestException);
    expect(prisma.payrollRun.updateMany).not.toHaveBeenCalled();
    expect(prisma.journal.create).not.toHaveBeenCalled();
  });

  it('never marks a run with negative net pay paid', async () => {
    prisma.payrollRun.findFirst.mockResolvedValue({
      ...run,
      totalNet: dec('-10.00'),
    } as never);

    await expect(serviceWithLock().markAsPaid(ORG, run.id)).rejects.toThrow(BadRequestException);
    expect(prisma.payrollRun.updateMany).not.toHaveBeenCalled();
    expect(prisma.journal.create).not.toHaveBeenCalled();
  });

  it('resolves dedicated salary, cash and payable accounts before generic prefixes', async () => {
    prisma.account.findFirst.mockImplementation(((args: { where: Record<string, unknown> }) =>
      // Queries with a `code` filter are the generic-prefix fallbacks.
      Promise.resolve({ id: 'code' in args.where ? 'acc-prefix' : 'acc-dedicated' })) as never);

    await serviceWithLock().markAsPaid(ORG, run.id);

    const accountIds = writtenJournals(prisma)[0].lines.map((l) => l.accountId);
    expect(accountIds).toContain('acc-dedicated');
    expect(accountIds).not.toContain('acc-prefix');
  });

  it('falls back to generic accounts only when no dedicated account exists', async () => {
    prisma.account.findFirst.mockImplementation(((args: { where: Record<string, unknown> }) => {
      // Salary and cash fall back to a code prefix, the payroll liability to a generic payable.
      if ('code' in args.where) return Promise.resolve({ id: 'acc-prefix' });
      if (JSON.stringify(args.where.OR ?? []).includes('Payable')) {
        return Promise.resolve({ id: 'acc-payable' });
      }
      return Promise.resolve(null);
    }) as never);

    await serviceWithLock().markAsPaid(ORG, run.id);

    const lines = writtenJournals(prisma)[0].lines;
    expect(lines.filter((l) => l.accountId === 'acc-prefix')).toHaveLength(2);
    expect(lines.find((l) => l.accountId === 'acc-payable')?.credit.toFixed(2)).toBe('218.43');
  });

  it('takes the ledger lock before reading the posting accounts', async () => {
    const order: string[] = [];
    prisma.$executeRaw.mockImplementation(((sql: unknown) => {
      order.push(`lock:${String(sql)}`);
      return Promise.resolve(0);
    }) as never);
    prisma.account.findFirst.mockImplementation((() => {
      order.push('account');
      return Promise.resolve({ id: 'acc-1' });
    }) as never);

    await serviceWithLock().markAsPaid(ORG, run.id);

    // The journal command takes the same (re-entrant) lock again later; the first one comes first.
    const firstLock = order.findIndex((step) => step.startsWith('lock:'));
    expect(firstLock).toBe(0);
    expect(order.indexOf('account')).toBeGreaterThan(firstLock);
  });
});

describe('PayrollService run lifecycle (#130)', () => {
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
    deletedAt: null as Date | null,
  };
  let prisma: MockPrismaClient;

  function service(): PayrollService {
    return new PayrollService(prisma as unknown as PrismaService, {} as never);
  }

  beforeEach(() => {
    prisma = createMockPrisma();
    prisma.payrollRun.updateMany.mockResolvedValue({ count: 1 });
    prisma.payrollRun.findUniqueOrThrow.mockResolvedValue({
      ...run,
      status: PayrollStatus.DRAFT,
    } as never);
  });

  it('blocks a live processed run for the same period', async () => {
    prisma.payrollRun.findFirst.mockResolvedValue(run as never);

    await expect(service().createPayrollRun(ORG, { month: 8, year: 2026 })).rejects.toThrow(
      BadRequestException,
    );
    expect(prisma.payrollRun.updateMany).not.toHaveBeenCalled();
    expect(prisma.payslip.deleteMany).not.toHaveBeenCalled();
  });

  it('reuses a live draft run without writing anything', async () => {
    const draft = { ...run, status: PayrollStatus.DRAFT };
    prisma.payrollRun.findFirst.mockResolvedValue(draft as never);

    await expect(service().createPayrollRun(ORG, { month: 8, year: 2026 })).resolves.toBe(draft);
    expect(prisma.payrollRun.updateMany).not.toHaveBeenCalled();
    expect(prisma.payrollRun.create).not.toHaveBeenCalled();
    expect(prisma.payslip.deleteMany).not.toHaveBeenCalled();
  });

  it('restores a soft-deleted unpaid run as a fresh draft with a guarded claim', async () => {
    prisma.payrollRun.findFirst.mockResolvedValue({ ...run, deletedAt: new Date() } as never);

    const restored = await service().createPayrollRun(ORG, { month: 8, year: 2026 });

    expect(restored).toMatchObject({ id: run.id, status: PayrollStatus.DRAFT });
    expect(prisma.payrollRun.updateMany).toHaveBeenCalledWith({
      where: {
        id: run.id,
        organizationId: ORG,
        deletedAt: { not: null },
        status: { not: PayrollStatus.PAID },
      },
      data: expect.objectContaining({
        deletedAt: null,
        status: PayrollStatus.DRAFT,
        processedAt: null,
      }),
    });
    // Only its discarded payslips go, and only after the claim succeeded.
    expect(prisma.payslip.deleteMany).toHaveBeenCalledWith({
      where: { payrollRunId: run.id, deletedAt: { not: null } },
    });
    expect(prisma.payrollRun.updateMany.mock.invocationCallOrder[0]).toBeLessThan(
      prisma.payslip.deleteMany.mock.invocationCallOrder[0],
    );
  });

  it('never restores a deleted run the guarded claim refuses (paid or restored meanwhile)', async () => {
    prisma.payrollRun.findFirst.mockResolvedValue({
      ...run,
      status: PayrollStatus.PAID,
      deletedAt: new Date(),
    } as never);
    prisma.payrollRun.updateMany.mockResolvedValue({ count: 0 });

    await expect(service().createPayrollRun(ORG, { month: 8, year: 2026 })).rejects.toThrow(
      ConflictException,
    );
    expect(prisma.payslip.deleteMany).not.toHaveBeenCalled();
  });

  it('soft-deletes the payslips of exactly the runs it claimed', async () => {
    prisma.payrollRun.updateMany.mockResolvedValue({ count: 2 });

    const result = await service().bulkDelete(ORG, ['run-1', 'run-2']);

    expect(result).toEqual({ deleted: 2, total: 2 });
    const claim = prisma.payrollRun.updateMany.mock.calls[0][0];
    const payslipWrite = prisma.payslip.updateMany.mock.calls[0][0];
    const deletedAt = claim.data.deletedAt;
    expect(deletedAt).toBeInstanceOf(Date);
    expect(claim.where).toEqual({
      id: { in: ['run-1', 'run-2'] },
      organizationId: ORG,
      status: { not: PayrollStatus.PAID },
      deletedAt: null,
    });
    // Same timestamp: a paid run, or one deleted earlier, keeps its payslips as they are.
    expect(payslipWrite).toEqual({
      where: {
        deletedAt: null,
        payrollRun: { id: { in: ['run-1', 'run-2'] }, organizationId: ORG, deletedAt },
      },
      data: { deletedAt },
    });
    expect(prisma.payrollRun.updateMany.mock.invocationCallOrder[0]).toBeLessThan(
      prisma.payslip.updateMany.mock.invocationCallOrder[0],
    );
  });
});
