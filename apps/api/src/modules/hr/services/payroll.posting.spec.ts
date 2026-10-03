import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { PayrollStatus } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../../../prisma/prisma.service';
import { PayrollService } from './payroll.service';

const ORG = 'org-1';

function fixture() {
  const calls: string[] = [];
  const run = {
    id: 'run-1',
    month: 1,
    year: 2026,
    status: PayrollStatus.PROCESSED as PayrollStatus,
    totalGross: new Decimal('100.3'),
    totalNet: new Decimal(90),
    totalDeductions: new Decimal('10.3'),
  };
  const tables = {
    payrollRun: {
      findFirst: jest.fn(async () => {
        calls.push('run');
        return { ...run };
      }),
      updateMany: jest.fn(async () => {
        run.status = PayrollStatus.PAID;
        return { count: 1 };
      }),
      update: jest.fn().mockResolvedValue({ ...run, status: PayrollStatus.PAID }),
    },
    account: {
      findFirst: jest.fn(async () => {
        calls.push('account');
        return { id: 'account' };
      }),
    },
    journal: {
      findFirst: jest.fn(async () => {
        calls.push('number');
        return null;
      }),
      create: jest.fn(async () => {
        calls.push('journal');
        return { id: 'j1' };
      }),
    },
  };
  let tail = Promise.resolve();
  const lock = jest.fn();
  const prisma = {
    ...tables,
    $transaction: jest.fn(
      async (fn: (tx: typeof tables & { $executeRaw: jest.Mock }) => Promise<unknown>) => {
        let release = () => {};
        const tx = {
          ...tables,
          $executeRaw: jest.fn(async () => {
            const previous = tail;
            tail = new Promise<void>((resolve) => {
              release = resolve;
            });
            await previous;
            calls.push('lock');
            lock();
            return 1;
          }),
        };
        try {
          return await fn(tx);
        } finally {
          release();
        }
      },
    ),
  };
  return {
    prisma,
    calls,
    run,
    lock,
    service: new PayrollService(prisma as unknown as PrismaService),
  };
}

describe('PayrollService locked posting', () => {
  it('locks before state, every posting account, number and journal', async () => {
    const { service, prisma, calls } = fixture();
    await service.markAsPaid(ORG, 'run-1');
    expect(calls).toEqual(['lock', 'run', 'account', 'account', 'number', 'account', 'journal']);
    expect(prisma.payrollRun.findFirst).toHaveBeenCalledWith({
      where: { id: 'run-1', organizationId: ORG, deletedAt: null },
    });
    expect(prisma.account.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ organizationId: ORG }) }),
    );
    expect(prisma.payrollRun.updateMany).toHaveBeenCalledWith({
      where: { id: 'run-1', organizationId: ORG, deletedAt: null, status: PayrollStatus.PROCESSED },
      data: { status: PayrollStatus.PAID },
    });
    expect(prisma.journal.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organizationId: ORG,
          sourceType: 'PAYROLL_PAYMENT',
          sourceId: 'run-1',
        }),
      }),
    );
  });

  it('two concurrent payments produce one payroll journal', async () => {
    const { service, prisma } = fixture();
    const results = await Promise.allSettled([
      service.markAsPaid(ORG, 'run-1'),
      service.markAsPaid(ORG, 'run-1'),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect(prisma.journal.create).toHaveBeenCalledTimes(1);
    expect(prisma.payrollRun.updateMany).toHaveBeenCalledTimes(1);
  });

  it('rechecks PAID after acquiring the lock before reading posting accounts', async () => {
    const { service, prisma, run, lock } = fixture();
    lock.mockImplementation(() => {
      run.status = PayrollStatus.PAID;
    });
    await expect(service.markAsPaid(ORG, 'run-1')).rejects.toThrow(BadRequestException);
    expect(prisma.account.findFirst).not.toHaveBeenCalled();
    expect(prisma.journal.findFirst).not.toHaveBeenCalled();
    expect(prisma.journal.create).not.toHaveBeenCalled();
  });

  it('rejects missing/deleted/foreign payroll without a journal', async () => {
    const { service, prisma } = fixture();
    prisma.payrollRun.findFirst.mockResolvedValue(null as never);
    await expect(service.markAsPaid(ORG, 'foreign')).rejects.toThrow(NotFoundException);
    expect(prisma.journal.create).not.toHaveBeenCalled();
  });

  it('uses amounts refreshed inside the lock', async () => {
    const { service, prisma, run, lock } = fixture();
    lock.mockImplementation(() => {
      run.totalGross = new Decimal(200);
      run.totalNet = new Decimal('189.7');
    });
    await service.markAsPaid(ORG, 'run-1');
    expect(prisma.journal.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          lines: {
            create: expect.arrayContaining([expect.objectContaining({ debit: new Decimal(200) })]),
          },
        }),
      }),
    );
  });

  it('fails the transaction if the guarded state transition loses', async () => {
    const { service, prisma } = fixture();
    prisma.payrollRun.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.markAsPaid(ORG, 'run-1')).rejects.toThrow(ConflictException);
    expect(prisma.payrollRun.update).not.toHaveBeenCalled();
  });
});
