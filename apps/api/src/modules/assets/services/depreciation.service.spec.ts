import { BadRequestException, ConflictException } from '@nestjs/common';
import { AssetStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { dec } from '../../../test/helpers/decimal.helpers';
import {
  expectBalanced,
  realJournalsService,
  writtenJournals,
} from '../../../test/helpers/ledger.helpers';
import { createMockPrisma, MockPrismaClient } from '../../../test/mocks/prisma.mock';
import { DepreciationService } from './depreciation.service';

describe('DepreciationService (#130)', () => {
  const ORG = 'org-1';
  const asset = {
    id: 'asset-1',
    assetNumber: 'FA-001',
    name: 'Laptop',
    status: AssetStatus.ACTIVE,
    depreciationAccountId: 'acc-expense',
    accumulatedDeprAccountId: 'acc-accumulated',
    salvageValue: dec('0'),
    purchasePrice: dec('1000'),
  };
  const schedule = {
    id: 'sched-1',
    assetId: asset.id,
    month: 9,
    year: 2026,
    amount: dec('83.33'),
    accumulatedTotal: dec('166.66'),
    bookValue: dec('833.34'),
    organizationId: ORG,
  };
  let prisma: MockPrismaClient;
  /** The asset's latest posted period, an open period it would skip, and a later posted period. */
  let latestPosted: { month: number; year: number } | null;
  let skippedOpen: { id: string } | null;
  let laterPosted: { id: string } | null;
  let scheduleRow: Record<string, unknown>;

  function serviceWithLock(lockDate: Date | null = null): DepreciationService {
    return new DepreciationService(
      prisma as unknown as PrismaService,
      realJournalsService(prisma, lockDate),
    );
  }

  /** The data the asset register was updated with, at currency scale. */
  function registerUpdate(): { accumulated: string; bookValue: string; status: unknown } {
    const { data } = prisma.asset.update.mock.calls[0][0] as unknown as {
      data: {
        accumulatedDepreciation: Prisma.Decimal;
        currentBookValue: Prisma.Decimal;
        status: unknown;
      };
    };
    return {
      accumulated: data.accumulatedDepreciation.toFixed(2),
      bookValue: data.currentBookValue.toFixed(2),
      status: data.status,
    };
  }

  beforeEach(() => {
    prisma = createMockPrisma();
    latestPosted = null;
    skippedOpen = null;
    laterPosted = null;
    scheduleRow = schedule;
    prisma.asset.findFirst.mockResolvedValue(asset as never);
    // One resolver per lookup: the period itself, the latest posted period (ordered), an open
    // period in between (executedAt: null) and a posted period after this one (an OR on periods).
    prisma.depreciationSchedule.findFirst.mockImplementation(((args: {
      where: Prisma.DepreciationScheduleWhereInput;
    }) => {
      const { where } = args;
      if (where.id || where.month) {
        return Promise.resolve(
          where.month ? { ...scheduleRow, month: where.month, year: where.year } : scheduleRow,
        );
      }
      if (where.executedAt === null) return Promise.resolve(skippedOpen);
      return Promise.resolve(where.OR ? laterPosted : latestPosted);
    }) as never);
    prisma.depreciationSchedule.updateMany.mockResolvedValue({ count: 1 });
    prisma.depreciationSchedule.aggregate.mockResolvedValue({
      _sum: { amount: dec('166.66') },
    } as never);
    prisma.journal.count.mockResolvedValue(0);
  });

  describe('posting a period', () => {
    it('posts one balanced DEPRECIATION journal on the period end under the ledger lock', async () => {
      const result = await serviceWithLock().runDepreciationForAsset(ORG, asset.id, 9, 2026);

      const [journal, ...rest] = writtenJournals(prisma);
      expect(rest).toHaveLength(0);
      expectBalanced(journal.lines);
      expect(journal.sourceType).toBe('DEPRECIATION');
      expect(journal.sourceId).toBe(schedule.id);
      expect(journal.date.toISOString()).toBe('2026-09-30T00:00:00.000Z');
      expect(result).toEqual({ journalId: 'journal-new', amount: 83.33 });
      expect(prisma.$executeRaw).toHaveBeenCalled();
      expect(prisma.depreciationSchedule.updateMany).toHaveBeenCalledWith({
        where: { id: schedule.id, organizationId: ORG, executedAt: null },
        data: { executedAt: expect.any(Date) },
      });
    });

    it('updates the asset register to the posted total, so it follows the ledger', async () => {
      await serviceWithLock().runDepreciationForAsset(ORG, asset.id, 9, 2026);

      expect(prisma.depreciationSchedule.aggregate).toHaveBeenCalledWith({
        where: { assetId: asset.id, organizationId: ORG, executedAt: { not: null } },
        _sum: { amount: true },
      });
      expect(registerUpdate()).toEqual({
        accumulated: '166.66',
        bookValue: '833.34',
        status: AssetStatus.ACTIVE,
      });
    });

    it('marks the asset fully depreciated once the posted total reaches the salvage value', async () => {
      prisma.depreciationSchedule.aggregate.mockResolvedValue({
        _sum: { amount: dec('1000') },
      } as never);

      await serviceWithLock().runDepreciationForAsset(ORG, asset.id, 9, 2026);

      expect(registerUpdate()).toEqual({
        accumulated: '1000.00',
        bookValue: '0.00',
        status: AssetStatus.FULLY_DEPRECIATED,
      });
    });

    it('rejects the posting when the lock date covers the period', async () => {
      const service = serviceWithLock(new Date('2026-09-30T00:00:00.000Z'));

      await expect(service.runDepreciationForAsset(ORG, asset.id, 9, 2026)).rejects.toThrow(
        /locked/,
      );
      expect(prisma.journal.create).not.toHaveBeenCalled();
    });

    it('does not post a period that another run already claimed', async () => {
      prisma.depreciationSchedule.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        serviceWithLock().runDepreciationForAsset(ORG, asset.id, 9, 2026),
      ).rejects.toThrow(ConflictException);
      expect(prisma.journal.create).not.toHaveBeenCalled();
    });

    it('re-runs a reversed period under a new source id', async () => {
      prisma.journal.count.mockResolvedValue(1);

      await serviceWithLock().runDepreciationForAsset(ORG, asset.id, 9, 2026);

      expect(writtenJournals(prisma)[0].sourceId).toBe(`${schedule.id}:1`);
    });
  });

  describe('period order', () => {
    it('lets the first posting of a backdated asset start at any period', async () => {
      skippedOpen = { id: 'sched-earlier' }; // open earlier periods, but nothing posted yet

      await serviceWithLock().runDepreciationForAsset(ORG, asset.id, 9, 2026);

      expect(writtenJournals(prisma)).toHaveLength(1);
    });

    it('rejects a period behind a later posted one', async () => {
      latestPosted = { month: 10, year: 2026 };

      await expect(
        serviceWithLock().runDepreciationForAsset(ORG, asset.id, 9, 2026),
      ).rejects.toThrow(/later depreciation period is already posted/);
      expect(prisma.depreciationSchedule.updateMany).not.toHaveBeenCalled();
      expect(prisma.journal.create).not.toHaveBeenCalled();
    });

    it('rejects skipping an open period after the latest posted one', async () => {
      latestPosted = { month: 7, year: 2026 };
      skippedOpen = { id: 'sched-aug' };

      await expect(
        serviceWithLock().runDepreciationForAsset(ORG, asset.id, 9, 2026),
      ).rejects.toThrow(/earlier open depreciation periods/);
      const skippedQuery = prisma.depreciationSchedule.findFirst.mock.calls
        .map(([args]) => args?.where)
        .find((where) => where?.executedAt === null);
      expect(skippedQuery).toMatchObject({
        assetId: asset.id,
        organizationId: ORG,
        amount: { gt: 0 },
        AND: [
          { OR: [{ year: { gt: 2026 } }, { year: 2026, month: { gt: 7 } }] },
          { OR: [{ year: { lt: 2026 } }, { year: 2026, month: { lt: 9 } }] },
        ],
      });
      expect(prisma.journal.create).not.toHaveBeenCalled();
    });

    it('posts the period right after the latest posted one', async () => {
      latestPosted = { month: 8, year: 2026 };

      await serviceWithLock().runDepreciationForAsset(ORG, asset.id, 9, 2026);

      expect(writtenJournals(prisma)).toHaveLength(1);
    });
  });

  describe('the monthly run', () => {
    const open = (month: number, year = 2026) => ({ assetId: asset.id, month, year });

    beforeEach(() => {
      jest.useFakeTimers({ now: new Date('2026-09-30T12:00:00.000Z') });
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('skips a period the manual run posted meanwhile', async () => {
      prisma.depreciationSchedule.findMany
        .mockResolvedValueOnce([open(9)] as never)
        .mockResolvedValueOnce([] as never);
      prisma.depreciationSchedule.updateMany.mockResolvedValue({ count: 0 });

      const result = await serviceWithLock().runMonthlyDepreciation(ORG);

      expect(result).toEqual({ processed: 0, journalsCreated: 0, totalDepreciation: 0 });
      expect(prisma.journal.create).not.toHaveBeenCalled();
    });

    it('catches up the open periods after the latest posted one, oldest first', async () => {
      // March is open behind the posted July (an old gap): only August and September follow.
      prisma.depreciationSchedule.findMany
        .mockResolvedValueOnce([open(3), open(8), open(9)] as never)
        .mockResolvedValueOnce([{ assetId: asset.id, month: 7, year: 2026 }] as never);

      const result = await serviceWithLock().runMonthlyDepreciation(ORG);

      expect(writtenJournals(prisma).map((j) => j.date.toISOString().slice(0, 10))).toEqual([
        '2026-08-31',
        '2026-09-30',
      ]);
      expect(result).toEqual({ processed: 2, journalsCreated: 2, totalDepreciation: 166.66 });
      expect(prisma.depreciationSchedule.findMany.mock.calls[0][0]).toMatchObject({
        where: {
          organizationId: ORG,
          executedAt: null,
          OR: [{ year: { lt: 2026 } }, { year: 2026, month: { lte: 9 } }],
        },
        orderBy: [{ year: 'asc' }, { month: 'asc' }],
      });
    });

    it('starts an asset with nothing posted at the current month', async () => {
      prisma.depreciationSchedule.findMany
        .mockResolvedValueOnce([open(1, 2025), open(9)] as never)
        .mockResolvedValueOnce([] as never);

      await serviceWithLock().runMonthlyDepreciation(ORG);

      const journals = writtenJournals(prisma);
      expect(journals).toHaveLength(1);
      expect(journals[0].date.toISOString()).toBe('2026-09-30T00:00:00.000Z');
    });

    it('stops an asset at a period that cannot post', async () => {
      prisma.depreciationSchedule.findMany
        .mockResolvedValueOnce([open(8), open(9)] as never)
        .mockResolvedValueOnce([{ assetId: asset.id, month: 7, year: 2026 }] as never);

      const result = await serviceWithLock(
        new Date('2026-08-31T00:00:00.000Z'),
      ).runMonthlyDepreciation(ORG);

      expect(result.journalsCreated).toBe(0);
      expect(prisma.depreciationSchedule.updateMany).toHaveBeenCalledTimes(1); // August only
      expect(prisma.journal.create).not.toHaveBeenCalled();
    });
  });

  describe('reverseDepreciation', () => {
    const original = {
      id: 'journal-orig',
      journalNumber: 'JRN-007',
      date: new Date('2026-09-30T00:00:00.000Z'),
      isPosted: true,
      reversalOfId: null,
      reversedBy: null,
      sourceType: 'DEPRECIATION',
      lines: [
        { accountId: 'acc-expense', debit: dec('83.33'), credit: dec('0'), description: 'Dep' },
        { accountId: 'acc-accumulated', debit: dec('0'), credit: dec('83.33'), description: 'Acc' },
      ],
    };

    beforeEach(() => {
      scheduleRow = { ...schedule, executedAt: new Date(), journalId: original.id, asset };
      prisma.journal.findFirst.mockResolvedValue(original as never);
      prisma.depreciationSchedule.aggregate.mockResolvedValue({
        _sum: { amount: dec('83.33') },
      } as never);
    });

    it('creates a linked, balanced reversal and never un-posts the original', async () => {
      await serviceWithLock().reverseDepreciation(ORG, schedule.id);

      const [reversal] = writtenJournals(prisma);
      expect(reversal.reversalOfId).toBe(original.id);
      expect(reversal.isPosted).toBe(true);
      expect(reversal.sourceType).toBe('DEPRECIATION_REVERSAL');
      expect(reversal.sourceId).toBe(original.id);
      expectBalanced(reversal.lines);
      expect(reversal.lines.find((l) => l.accountId === 'acc-expense')?.credit).toEqual(
        dec('83.33'),
      );
      expect(prisma.journal.update).not.toHaveBeenCalled();
      expect(prisma.journal.updateMany).not.toHaveBeenCalled();
      expect(prisma.depreciationSchedule.updateMany).toHaveBeenCalledWith({
        where: { id: schedule.id, organizationId: ORG, journalId: original.id },
        data: { journalId: null, executedAt: null },
      });
    });

    it('returns the asset register to the periods still posted', async () => {
      await serviceWithLock().reverseDepreciation(ORG, schedule.id);

      expect(registerUpdate()).toEqual({
        accumulated: '83.33',
        bookValue: '916.67',
        status: AssetStatus.ACTIVE,
      });
    });

    it('returns the asset to its purchase price when no period stays posted', async () => {
      prisma.depreciationSchedule.aggregate.mockResolvedValue({ _sum: { amount: null } } as never);

      await serviceWithLock().reverseDepreciation(ORG, schedule.id);

      expect(registerUpdate()).toEqual({
        accumulated: '0.00',
        bookValue: '1000.00',
        status: AssetStatus.ACTIVE,
      });
    });

    it('rejects reversing a period behind a later posted one', async () => {
      laterPosted = { id: 'sched-oct' };

      await expect(serviceWithLock().reverseDepreciation(ORG, schedule.id)).rejects.toThrow(
        /later depreciation periods first/,
      );
      const laterQuery = prisma.depreciationSchedule.findFirst.mock.calls
        .map(([args]) => args?.where)
        .find((where) => where?.OR);
      expect(laterQuery).toMatchObject({
        assetId: asset.id,
        organizationId: ORG,
        executedAt: { not: null },
        OR: [{ year: { gt: 2026 } }, { year: 2026, month: { gt: 9 } }],
      });
      expect(prisma.depreciationSchedule.updateMany).not.toHaveBeenCalled();
      expect(prisma.journal.create).not.toHaveBeenCalled();
    });

    it('rejects a reversal dated inside a locked period', async () => {
      const service = serviceWithLock(new Date('2099-01-01T00:00:00.000Z'));

      await expect(service.reverseDepreciation(ORG, schedule.id)).rejects.toThrow(/locked/);
      expect(prisma.journal.create).not.toHaveBeenCalled();
    });

    it('rejects reversing a period that was never posted', async () => {
      scheduleRow = { ...schedule, executedAt: null, journalId: null, asset };

      await expect(serviceWithLock().reverseDepreciation(ORG, schedule.id)).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
