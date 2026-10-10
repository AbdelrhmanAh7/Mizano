import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { AssetStatus } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { DepreciationService } from './depreciation.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { JournalsService } from '../../accounting/services/journals.service';

const ORG = 'org-1';

function fixture() {
  const calls: string[] = [];
  const asset = {
    id: 'a1',
    name: 'Laptop',
    assetNumber: 'FA-001',
    status: AssetStatus.ACTIVE as AssetStatus,
    salvageValue: new Decimal(0),
    purchasePrice: new Decimal(1000),
    depreciationAccountId: 'dep',
    accumulatedDeprAccountId: 'acc',
  };
  const schedule = {
    id: 's1',
    assetId: asset.id,
    month: 1,
    year: 2026,
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
  const journals = {
    reverse: jest.fn(async (..._args: unknown[]) => {
      calls.push('reverse');
      return { id: 'rev1' };
    }),
  };
  return {
    service: new DepreciationService(
      prisma as unknown as PrismaService,
      journals as unknown as JournalsService,
    ),
    prisma,
    journals,
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
});

describe('DepreciationService reversal', () => {
  interface Entry {
    id: string;
    month: number;
    year: number;
    accumulatedTotal: Decimal;
    bookValue: Decimal;
  }

  /**
   * Only `$transaction` exists on the outer client, so any query that bypasses the transaction
   * client (and with it the ledger lock) fails the test.
   */
  function setup() {
    const calls: string[] = [];
    const asset = {
      id: 'a1',
      status: AssetStatus.ACTIVE as AssetStatus,
      purchasePrice: new Decimal(1000),
    };
    const schedule = {
      id: 's1',
      assetId: 'a1',
      month: 2,
      year: 2026,
      executedAt: new Date('2026-02-28T00:00:00Z') as Date | null,
      journalId: 'j2' as string | null,
      asset,
    };
    const state = {
      schedule: schedule as typeof schedule | null,
      later: null as { id: string } | null,
      previous: {
        id: 's0',
        month: 1,
        year: 2026,
        accumulatedTotal: new Decimal(100),
        bookValue: new Decimal(900),
      } as Entry | null,
      guardCount: 1,
    };
    const lock = jest.fn();
    const tables = {
      depreciationSchedule: {
        findFirst: jest.fn(async (args: { where: { id?: string; OR?: unknown } }) => {
          if (args.where.id === 's1') {
            calls.push('schedule');
            return state.schedule && { ...state.schedule };
          }
          if (args.where.OR) {
            calls.push('later');
            return state.later;
          }
          calls.push('previous');
          return state.previous;
        }),
        updateMany: jest.fn(async (..._args: unknown[]) => {
          calls.push('transition');
          return { count: state.guardCount };
        }),
      },
      asset: {
        update: jest.fn(async (..._args: unknown[]) => {
          calls.push('asset');
          return asset;
        }),
      },
      journal: { update: jest.fn(), updateMany: jest.fn(), create: jest.fn() },
    };
    const tx = {
      ...tables,
      $executeRaw: jest.fn(async () => {
        calls.push('lock');
        lock();
        return 1;
      }),
    };
    const prisma = {
      $transaction: jest.fn(async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx)),
    };
    const journals = {
      reverse: jest.fn(async (..._args: unknown[]) => {
        calls.push('reverse');
        return { id: 'rev1' };
      }),
    };
    const service = new DepreciationService(
      prisma as unknown as PrismaService,
      journals as unknown as JournalsService,
    );
    return { service, tx, tables, journals, calls, asset, schedule, state, lock };
  }

  it('posts a linked reversal in the locked transaction and never un-posts the original', async () => {
    const { service, tx, tables, journals, calls } = setup();

    await service.reverseDepreciation(ORG, 's1');

    expect(calls).toEqual([
      'lock',
      'schedule',
      'later',
      'transition',
      'reverse',
      'previous',
      'asset',
    ]);
    // The shared reversal command: dated max(today, original), period lock enforced, linked by
    // reversalOfId. The original journal is not touched.
    expect(journals.reverse).toHaveBeenCalledWith(ORG, 'j2', undefined, { tx });
    expect(tables.journal.update).not.toHaveBeenCalled();
    expect(tables.journal.updateMany).not.toHaveBeenCalled();
    expect(tables.journal.create).not.toHaveBeenCalled();
    expect(tables.depreciationSchedule.findFirst).toHaveBeenNthCalledWith(1, {
      where: { id: 's1', organizationId: ORG },
      include: { asset: true },
    });
    expect(tables.depreciationSchedule.updateMany).toHaveBeenCalledWith({
      where: { id: 's1', organizationId: ORG, executedAt: { not: null }, journalId: 'j2' },
      data: { journalId: null, executedAt: null },
    });
  });

  it('only looks for a later executed entry of the same asset and organization', async () => {
    const { service, tables } = setup();

    await service.reverseDepreciation(ORG, 's1');

    expect(tables.depreciationSchedule.findFirst).toHaveBeenNthCalledWith(2, {
      where: {
        assetId: 'a1',
        organizationId: ORG,
        executedAt: { not: null },
        OR: [{ year: { gt: 2026 } }, { year: 2026, month: { gt: 2 } }],
      },
      select: { id: true },
    });
  });

  it('takes the asset back to the previous executed entry', async () => {
    const { service, tables } = setup();

    await service.reverseDepreciation(ORG, 's1');

    expect(tables.depreciationSchedule.findFirst).toHaveBeenNthCalledWith(3, {
      where: { assetId: 'a1', organizationId: ORG, executedAt: { not: null } },
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
    });
    expect(tables.asset.update).toHaveBeenCalledWith({
      where: { id: 'a1', organizationId: ORG },
      data: {
        accumulatedDepreciation: new Decimal(100),
        currentBookValue: new Decimal(900),
        status: AssetStatus.ACTIVE,
      },
    });
  });

  it('resets the asset to its purchase price when no executed entry is left', async () => {
    const { service, tables, state, asset } = setup();
    state.previous = null;
    asset.status = AssetStatus.FULLY_DEPRECIATED;

    await service.reverseDepreciation(ORG, 's1');

    expect(tables.asset.update).toHaveBeenCalledWith({
      where: { id: 'a1', organizationId: ORG },
      data: {
        accumulatedDepreciation: new Decimal(0),
        currentBookValue: new Decimal(1000),
        status: AssetStatus.ACTIVE,
      },
    });
  });

  it('rejects an entry that is not the latest executed one and writes nothing', async () => {
    const { service, tables, journals, state } = setup();
    state.later = { id: 's3' };

    await expect(service.reverseDepreciation(ORG, 's1')).rejects.toThrow(BadRequestException);
    await expect(service.reverseDepreciation(ORG, 's1')).rejects.toThrow(
      /Only the latest executed depreciation entry can be reversed/,
    );

    expect(tables.depreciationSchedule.updateMany).not.toHaveBeenCalled();
    expect(journals.reverse).not.toHaveBeenCalled();
    expect(tables.asset.update).not.toHaveBeenCalled();
  });

  it.each([AssetStatus.DISPOSED, AssetStatus.SOLD])(
    'refuses to reverse the depreciation of a %s asset',
    async (status) => {
      const { service, tables, journals, asset } = setup();
      asset.status = status;

      await expect(service.reverseDepreciation(ORG, 's1')).rejects.toThrow(
        'Depreciation of a disposed asset cannot be reversed',
      );

      expect(journals.reverse).not.toHaveBeenCalled();
      expect(tables.asset.update).not.toHaveBeenCalled();
    },
  );

  it('is a 404 for an unknown schedule or one of another organization', async () => {
    const { service, tables, journals, state } = setup();
    state.schedule = null;

    await expect(service.reverseDepreciation(ORG, 's1')).rejects.toThrow(NotFoundException);

    // The lookup is scoped by organization, so a foreign id finds nothing.
    expect(tables.depreciationSchedule.findFirst).toHaveBeenCalledWith({
      where: { id: 's1', organizationId: ORG },
      include: { asset: true },
    });
    expect(journals.reverse).not.toHaveBeenCalled();
  });

  it.each([
    ['was not executed', null, 'j2', 'Depreciation was not executed'],
    ['has no linked journal', new Date('2026-02-28T00:00:00Z'), null, /no linked ledger entry/],
  ])('refuses an entry that %s', async (_label, executedAt, journalId, message) => {
    const { service, schedule, journals, tables } = setup();
    schedule.executedAt = executedAt;
    schedule.journalId = journalId;

    await expect(service.reverseDepreciation(ORG, 's1')).rejects.toThrow(message);

    expect(journals.reverse).not.toHaveBeenCalled();
    expect(tables.asset.update).not.toHaveBeenCalled();
  });

  it('rechecks the entry after waiting for the lock', async () => {
    const { service, schedule, journals, tables, lock } = setup();
    // A concurrent reversal committed while this request waited for the ledger lock.
    lock.mockImplementation(() => {
      schedule.executedAt = null;
      schedule.journalId = null;
    });

    await expect(service.reverseDepreciation(ORG, 's1')).rejects.toThrow(
      'Depreciation was not executed',
    );

    expect(journals.reverse).not.toHaveBeenCalled();
    expect(tables.depreciationSchedule.updateMany).not.toHaveBeenCalled();
  });

  it('aborts on a lost execution guard before posting a reversal', async () => {
    const { service, tables, journals, state } = setup();
    state.guardCount = 0;

    await expect(service.reverseDepreciation(ORG, 's1')).rejects.toThrow(ConflictException);

    expect(journals.reverse).not.toHaveBeenCalled();
    expect(tables.asset.update).not.toHaveBeenCalled();
  });

  it('leaves the asset alone when the reversal itself is refused', async () => {
    const { service, tables, journals } = setup();
    journals.reverse.mockRejectedValue(new BadRequestException('This period is locked'));

    await expect(service.reverseDepreciation(ORG, 's1')).rejects.toThrow('This period is locked');

    expect(tables.asset.update).not.toHaveBeenCalled();
  });
});
