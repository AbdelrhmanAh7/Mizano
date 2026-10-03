import { ConflictException } from '@nestjs/common';
import { AssetStatus } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { DepreciationService } from './depreciation.service';
import { PrismaService } from '../../../prisma/prisma.service';

const ORG = 'org-1';

function fixture() {
  const calls: string[] = [];
  const asset = {
    id: 'a1',
    name: 'Laptop',
    assetNumber: 'FA-001',
    status: AssetStatus.ACTIVE,
    salvageValue: new Decimal(0),
    purchasePrice: new Decimal(1000),
    depreciationAccountId: 'dep',
    accumulatedDeprAccountId: 'acc',
  };
  const schedule = {
    id: 's1',
    assetId: asset.id,
    amount: new Decimal(100),
    accumulatedTotal: new Decimal(100),
    bookValue: new Decimal(900),
    executedAt: null as Date | null,
    journalId: null as string | null,
    asset,
  };
  const tables = {
    journal: {
      findFirst: jest.fn(async () => {
        calls.push('number');
        return null;
      }),
      create: jest.fn(async () => {
        calls.push('journal');
        return { id: 'j1' };
      }),
      update: jest.fn(),
    },
    depreciationSchedule: {
      findFirst: jest.fn(async () => {
        calls.push('schedule');
        return { ...schedule };
      }),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn(),
      updateMany: jest.fn(async () => {
        schedule.executedAt = new Date();
        schedule.journalId = 'j1';
        return { count: 1 };
      }),
    },
    asset: {
      findMany: jest.fn().mockResolvedValue([{ id: asset.id }]),
      findFirst: jest.fn(async () => {
        calls.push('asset');
        return asset;
      }),
      update: jest.fn(),
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
    service: new DepreciationService(prisma as unknown as PrismaService),
    prisma,
    calls,
    schedule,
    asset,
    lock,
  };
}

describe('DepreciationService ledger lock', () => {
  it('locks before reading posting state, generating a number and creating a journal', async () => {
    const { service, prisma, calls } = fixture();
    const result = await service.runDepreciationForAsset(ORG, 'a1', 1, 2026);
    expect(result).toEqual({ journalId: 'j1', amount: '100.0000' });
    expect(calls).toEqual(['lock', 'asset', 'schedule', 'number', 'journal']);
    expect(calls.filter((call) => ['lock', 'number', 'journal'].includes(call))).toEqual([
      'lock',
      'number',
      'journal',
    ]);
    expect(prisma.depreciationSchedule.findFirst).toHaveBeenCalledWith({
      where: { assetId: 'a1', organizationId: ORG, month: 1, year: 2026 },
    });
    expect(prisma.depreciationSchedule.updateMany).toHaveBeenCalledWith({
      where: { id: 's1', organizationId: ORG, executedAt: null },
      data: { journalId: 'j1', executedAt: expect.any(Date) },
    });
    expect(prisma.asset.update).toHaveBeenCalledWith({
      where: { id: 'a1', organizationId: ORG },
      data: { accumulatedDepreciation: new Decimal(100), currentBookValue: new Decimal(900) },
    });
  });

  it('rejects a manual request if the entry became executed while waiting for the lock', async () => {
    const { service, prisma, schedule, lock } = fixture();
    lock.mockImplementation(() => {
      schedule.executedAt = new Date();
    });
    await expect(service.runDepreciationForAsset(ORG, 'a1', 1, 2026)).rejects.toThrow(
      'Depreciation already executed for this period',
    );
    expect(prisma.journal.findFirst).not.toHaveBeenCalled();
    expect(prisma.journal.create).not.toHaveBeenCalled();
    expect(prisma.asset.update).not.toHaveBeenCalled();
  });

  it('skips a scheduled entry executed while waiting and does not inflate counts', async () => {
    const { service, prisma, schedule, lock } = fixture();
    lock.mockImplementation(() => {
      schedule.executedAt = new Date();
    });
    expect(await service.runMonthlyDepreciation(ORG)).toEqual({
      processed: 0,
      journalsCreated: 0,
      totalDepreciation: '0.0000',
    });
    expect(prisma.journal.create).not.toHaveBeenCalled();
    expect(prisma.asset.update).not.toHaveBeenCalled();
  });

  it('posts a scheduled entry in lock, number, journal order and counts only committed work', async () => {
    const { service, prisma, calls } = fixture();
    expect(await service.runMonthlyDepreciation(ORG)).toEqual({
      processed: 1,
      journalsCreated: 1,
      totalDepreciation: '100.0000',
    });
    expect(calls).toEqual(['lock', 'asset', 'schedule', 'number', 'journal']);
    expect(prisma.depreciationSchedule.findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({ organizationId: ORG, assetId: 'a1' }),
    });
  });

  it('a concurrent manual and scheduled request post the same schedule only once', async () => {
    const { service, prisma, lock } = fixture();
    const firstLock = new Promise<void>((resolve) => lock.mockImplementationOnce(resolve));
    const scheduled = service.runMonthlyDepreciation(ORG);
    await firstLock;
    const results = await Promise.allSettled([
      scheduled,
      service.runDepreciationForAsset(ORG, 'a1'),
    ]);
    expect(results[0]).toMatchObject({
      status: 'fulfilled',
      value: { processed: 1, journalsCreated: 1 },
    });
    expect(results[1]).toMatchObject({ status: 'rejected', reason: expect.any(Error) });
    expect(prisma.journal.create).toHaveBeenCalledTimes(1);
    expect(prisma.depreciationSchedule.updateMany).toHaveBeenCalledTimes(1);
    expect(prisma.asset.update).toHaveBeenCalledTimes(1);
  });

  it('does not depreciate an asset disposed while waiting for the lock', async () => {
    const { service, prisma } = fixture();
    prisma.asset.findFirst.mockResolvedValue(null as never);
    expect(await service.runMonthlyDepreciation(ORG)).toMatchObject({
      processed: 0,
      journalsCreated: 0,
    });
    await expect(service.runDepreciationForAsset(ORG, 'a1')).rejects.toThrow(
      'Asset not found or not active',
    );
    expect(prisma.depreciationSchedule.findFirst).not.toHaveBeenCalled();
    expect(prisma.journal.create).not.toHaveBeenCalled();
  });

  it.each([null, 'zero'])('skips missing or non-positive scheduled entries (%s)', async (entry) => {
    const { service, prisma, schedule } = fixture();
    prisma.depreciationSchedule.findFirst.mockResolvedValue(
      entry === null
        ? (null as never)
        : {
            ...schedule,
            amount: new Decimal(0),
          },
    );
    expect(await service.runMonthlyDepreciation(ORG)).toMatchObject({
      processed: 0,
      journalsCreated: 0,
    });
    expect(prisma.journal.create).not.toHaveBeenCalled();
  });

  it('rejects a lost execution guard before mutating the asset', async () => {
    const { service, prisma } = fixture();
    prisma.depreciationSchedule.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.runDepreciationForAsset(ORG, 'a1')).rejects.toThrow(ConflictException);
    expect(prisma.asset.update).not.toHaveBeenCalled();
  });

  it('reverse also reads its execution marker inside the same ledger lock', async () => {
    const { service, prisma, calls, schedule } = fixture();
    schedule.executedAt = new Date();
    schedule.journalId = 'j1';
    await service.reverseDepreciation(ORG, 's1');
    expect(calls).toEqual(['lock', 'schedule']);
    expect(prisma.depreciationSchedule.findFirst).toHaveBeenCalledWith({
      where: { id: 's1', organizationId: ORG },
      include: { asset: true, journal: true },
    });
    expect(prisma.depreciationSchedule.findMany).toHaveBeenCalledWith({
      where: { assetId: 'a1', organizationId: ORG, executedAt: { not: null } },
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
      take: 1,
    });
  });
});
