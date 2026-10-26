import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { AssetStatus, DepreciationMethod } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { DepreciationService } from './depreciation.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { createMockPrisma, MockPrismaClient } from '../../../test/mocks/prisma.mock';

// DepreciationService has no Redis/cache dependency, so only Prisma is mocked.
// Schedule amounts are computed by AssetsService; this spec pins how the stored
// Decimal(19,4) schedule rows are posted to the ledger.

const ORG_A = 'org-a';
const ORG_B = 'org-b';
// 15 March 2026, local time: the service derives the period from local getMonth().
const FIXED_NOW = new Date(2026, 2, 15, 12, 0, 0);

type Row = Record<string, any>;

function asset(id: string, overrides: Row = {}): Row {
  return {
    id,
    assetNumber: `FA-${id}`,
    name: `Asset ${id}`,
    purchasePrice: new Decimal('2500.0000'),
    salvageValue: new Decimal('250.0000'),
    depreciationMethod: DepreciationMethod.STRAIGHT_LINE,
    accumulatedDepreciation: new Decimal('975.0000'),
    currentBookValue: new Decimal('1525.0000'),
    status: AssetStatus.ACTIVE,
    depreciationAccountId: `exp-${id}`,
    accumulatedDeprAccountId: `accdep-${id}`,
    organizationId: ORG_A,
    deletedAt: null,
    ...overrides,
  };
}

function schedule(
  assetId: string,
  amount: string,
  accumulated: string,
  book: string,
  overrides: Row = {},
): Row {
  return {
    id: `sch-${assetId}-2026-03`,
    assetId,
    month: 3,
    year: 2026,
    amount: new Decimal(amount),
    accumulatedTotal: new Decimal(accumulated),
    bookValue: new Decimal(book),
    journalId: null,
    executedAt: null,
    organizationId: ORG_A,
    ...overrides,
  };
}

const mock = (fn: unknown): jest.Mock => fn as jest.Mock;
// Mirrors the service filter: same organization, ACTIVE, not soft-deleted.
const live = (a: Row, where: Row): boolean =>
  a.organizationId === where.organizationId && a.status === where.status && a.deletedAt === null;
const DECLINING: Row = {
  purchasePrice: new Decimal('10000.0000'),
  salvageValue: new Decimal('1000.0000'),
  depreciationMethod: DepreciationMethod.DECLINING_BALANCE,
};

describe('DepreciationService', () => {
  let service: DepreciationService;
  let prisma: MockPrismaClient;
  let assets: Row[];
  let schedules: Row[];
  let journalSeq: number;

  beforeEach(async () => {
    prisma = createMockPrisma();
    const module: TestingModule = await Test.createTestingModule({
      providers: [DepreciationService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(DepreciationService);

    jest.useFakeTimers({
      now: FIXED_NOW,
      doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'],
    });

    // Straight-line: (2500 - 250) / 60 months = 37.5 per month.
    // Declining balance: 10000 cost, 5 years, period 1 = 10000 * (2/5) / 12 = 333.3333.
    // Final period: residual 12.3456 lands the book value exactly on salvage 1000.
    assets = [
      asset('sl'),
      asset('db', DECLINING),
      asset('last', DECLINING),
      asset('other', { organizationId: ORG_B }),
    ];
    schedules = [
      schedule('sl', '37.5000', '1012.5000', '1487.5000'),
      schedule('db', '333.3333', '333.3333', '9666.6667'),
      schedule('last', '12.3456', '9000.0000', '1000.0000'),
      schedule('other', '37.5000', '1012.5000', '1487.5000', { organizationId: ORG_B }),
    ];
    journalSeq = 41;

    mock(prisma.asset.findMany).mockImplementation(async ({ where }) =>
      assets.filter((a) => live(a, where)),
    );
    mock(prisma.asset.findFirst).mockImplementation(
      async ({ where }) => assets.find((a) => a.id === where.id && live(a, where)) ?? null,
    );
    mock(prisma.asset.update).mockImplementation(async ({ where, data }) =>
      Object.assign(
        assets.find((a) => a.id === where.id && a.organizationId === where.organizationId)!,
        data,
      ),
    );
    // Serves both lookups: by period (assetId, month, year) and by id (reverse).
    mock(prisma.depreciationSchedule.findFirst).mockImplementation(async ({ where }) => {
      const hit = schedules.find(
        (s) =>
          s.organizationId === where.organizationId &&
          (where.id === undefined || s.id === where.id) &&
          (where.assetId === undefined ||
            (s.assetId === where.assetId && s.month === where.month && s.year === where.year)),
      );
      return hit
        ? { ...hit, asset: assets.find((a) => a.id === hit.assetId), journal: null }
        : null;
    });
    mock(prisma.depreciationSchedule.findMany).mockImplementation(async ({ where }) =>
      schedules
        .filter(
          (s) =>
            s.organizationId === where.organizationId &&
            (where.assetId === undefined || s.assetId === where.assetId) &&
            (where.month === undefined || (s.month === where.month && s.year === where.year)) &&
            (where.executedAt === null ? s.executedAt === null : s.executedAt !== null),
        )
        .map((s) => ({ ...s, asset: assets.find((a) => a.id === s.assetId) })),
    );
    mock(prisma.journal.update).mockResolvedValue({} as never);
    mock(prisma.depreciationSchedule.updateMany).mockImplementation(async ({ where, data }) => {
      // Atomic compare-and-set, like the DB: matches only unexecuted rows of this org.
      const hit = schedules.find(
        (s) =>
          s.id === where.id &&
          s.organizationId === where.organizationId &&
          (where.executedAt !== null || s.executedAt === null),
      );
      if (hit) Object.assign(hit, data);
      return { count: hit ? 1 : 0 };
    });
    mock(prisma.depreciationSchedule.update).mockImplementation(async ({ where, data }) =>
      Object.assign(
        schedules.find((s) => s.id === where.id && s.organizationId === where.organizationId)!,
        data,
      ),
    );
    mock(prisma.journal.findFirst).mockImplementation(async () => ({
      journalNumber: `JRN-${String(journalSeq).padStart(3, '0')}`,
    }));
    mock(prisma.journal.create).mockImplementation(async ({ data }) => {
      journalSeq++;
      return { id: `jrn-${journalSeq}`, ...data };
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  function journalFor(assetId: string): Row {
    const call = mock(prisma.journal.create).mock.calls.find(([arg]) =>
      String(arg.data.reference).startsWith(`DEP-FA-${assetId}-`),
    );
    expect(call).toBeDefined();
    return call![0].data;
  }

  function lines(data: Row): { accountId: string; debit: string; credit: string }[] {
    const rows: Row[] = data.lines.create;
    const debits = rows.reduce((s, l) => s.add(l.debit), new Decimal(0));
    const credits = rows.reduce((s, l) => s.add(l.credit), new Decimal(0));
    expect(rows.every((l) => l.debit instanceof Decimal && l.credit instanceof Decimal)).toBe(true);
    expect(debits.equals(credits)).toBe(true);
    return rows.map((l) => ({
      accountId: l.accountId,
      debit: l.debit.toFixed(4),
      credit: l.credit.toFixed(4),
    }));
  }

  describe.each([
    ['1487.5001', '0.0001'],
    ['1487.4999', '-0.0001'],
  ])('rounding residue (#512): book %s, residue %s', (bookValue, residue) => {
    beforeEach(() => {
      assets = [asset('sl')];
      schedules = [schedule('sl', '37.5000', '1012.5000', bookValue)];
      expect(
        schedules[0].bookValue
          .add(schedules[0].accumulatedTotal)
          .minus(assets[0].purchasePrice)
          .toFixed(4),
      ).toBe(residue);
    });

    it('AC1: monthly run posts a balanced journal despite a 0.0001 sum residue', async () => {
      const result = await service.runMonthlyDepreciation(ORG_A);

      expect(result).toEqual({ processed: 1, journalsCreated: 1, totalDepreciation: 37.5 });
      expect(lines(journalFor('sl'))).toEqual([
        { accountId: 'exp-sl', debit: '37.5000', credit: '0.0000' },
        { accountId: 'accdep-sl', debit: '0.0000', credit: '37.5000' },
      ]);
      expect(schedules[0]).toMatchObject({ journalId: 'jrn-42', executedAt: FIXED_NOW });
      expect(assets[0].currentBookValue.toFixed(4)).toBe(bookValue);
    });

    it('AC2: manual run returns a balanced journal despite a 0.0001 sum residue', async () => {
      await expect(service.runDepreciationForAsset(ORG_A, 'sl', 3, 2026)).resolves.toEqual({
        journalId: 'jrn-42',
        amount: 37.5,
      });
      expect(lines(journalFor('sl'))).toEqual([
        { accountId: 'exp-sl', debit: '37.5000', credit: '0.0000' },
        { accountId: 'accdep-sl', debit: '0.0000', credit: '37.5000' },
      ]);
      expect(schedules[0]).toMatchObject({ journalId: 'jrn-42', executedAt: FIXED_NOW });
      expect(assets[0].currentBookValue.toFixed(4)).toBe(bookValue);
    });
  });

  describe('runMonthlyDepreciation: journal lines', () => {
    it('posts straight-line 37.5000: Dr expense, Cr accumulated depreciation', async () => {
      const result = await service.runMonthlyDepreciation(ORG_A);

      expect(result).toMatchObject({ processed: 3, journalsCreated: 3 });
      const data = journalFor('sl');
      expect(data).toMatchObject({
        journalNumber: 'JRN-042',
        reference: 'DEP-FA-sl-2026-03',
        isPosted: true,
        organizationId: ORG_A,
        date: FIXED_NOW,
      });
      expect(lines(data)).toEqual([
        { accountId: 'exp-sl', debit: '37.5000', credit: '0.0000' },
        { accountId: 'accdep-sl', debit: '0.0000', credit: '37.5000' },
      ]);
      const sl = assets.find((a) => a.id === 'sl')!;
      expect(sl.accumulatedDepreciation.toFixed(4)).toBe('1012.5000');
      expect(sl.currentBookValue.toFixed(4)).toBe('1487.5000');
      expect(sl.status).toBe(AssetStatus.ACTIVE);
    });

    it('posts the declining-balance amount 333.3333 exactly', async () => {
      await service.runMonthlyDepreciation(ORG_A);

      expect(lines(journalFor('db'))).toEqual([
        { accountId: 'exp-db', debit: '333.3333', credit: '0.0000' },
        { accountId: 'accdep-db', debit: '0.0000', credit: '333.3333' },
      ]);
      expect(assets.find((a) => a.id === 'db')!.currentBookValue.toFixed(4)).toBe('9666.6667');
    });

    it('final period posts the residual so book value lands exactly on salvage', async () => {
      await service.runMonthlyDepreciation(ORG_A);

      expect(lines(journalFor('last'))).toEqual([
        { accountId: 'exp-last', debit: '12.3456', credit: '0.0000' },
        { accountId: 'accdep-last', debit: '0.0000', credit: '12.3456' },
      ]);
      const last = assets.find((a) => a.id === 'last')!;
      expect(last.purchasePrice.minus(last.accumulatedDepreciation).equals(last.salvageValue)).toBe(
        true,
      );
      expect(last.currentBookValue.equals(last.salvageValue)).toBe(true);
      expect(last.status).toBe(AssetStatus.FULLY_DEPRECIATED);
    });
  });

  describe('runDepreciationForAsset: journal lines', () => {
    it('posts the requested period dated on its first day', async () => {
      const result = await service.runDepreciationForAsset(ORG_A, 'db', 3, 2026);

      expect(result).toEqual({ journalId: 'jrn-42', amount: 333.3333 });
      const data = journalFor('db');
      expect(data.date).toEqual(new Date(2026, 2, 1));
      expect(data.organizationId).toBe(ORG_A);
      expect(lines(data)).toEqual([
        { accountId: 'exp-db', debit: '333.3333', credit: '0.0000' },
        { accountId: 'accdep-db', debit: '0.0000', credit: '333.3333' },
      ]);
      expect(schedules.find((s) => s.assetId === 'db')).toMatchObject({
        journalId: 'jrn-42',
        executedAt: FIXED_NOW,
      });
    });

    it('final period via manual run lands book value on salvage and marks FULLY_DEPRECIATED', async () => {
      const result = await service.runDepreciationForAsset(ORG_A, 'last', 3, 2026);

      expect(result).toEqual({ journalId: 'jrn-42', amount: 12.3456 });
      const last = assets.find((a) => a.id === 'last')!;
      expect(last.currentBookValue.equals(last.salvageValue)).toBe(true);
      expect(last.status).toBe(AssetStatus.FULLY_DEPRECIATED);
    });

    it('posts manual straight-line depreciation with balanced debit and credit', async () => {
      const result = await service.runDepreciationForAsset(ORG_A, 'sl', 3, 2026);

      expect(result).toEqual({ journalId: 'jrn-42', amount: 37.5 });
      const data = journalFor('sl');
      expect(data.date).toEqual(new Date(2026, 2, 1));
      expect(lines(data)).toEqual([
        { accountId: 'exp-sl', debit: '37.5000', credit: '0.0000' },
        { accountId: 'accdep-sl', debit: '0.0000', credit: '37.5000' },
      ]);
      const sl = assets.find((a) => a.id === 'sl')!;
      expect(sl.currentBookValue.toFixed(4)).toBe('1487.5000');
    });
  });

  describe('reverseDepreciation', () => {
    it('voids journal entry and restores asset book value and schedule state', async () => {
      schedules.push(
        schedule('sl', '37.5000', '1012.5000', '1487.5000', {
          id: 'sch-sl-2026-02',
          month: 2,
          executedAt: new Date(2026, 1, 28),
          journalId: 'jrn-old',
        }),
      );
      await service.reverseDepreciation(ORG_A, 'sch-sl-2026-02');

      const sch = schedules.find((s) => s.id === 'sch-sl-2026-02')!;
      expect(sch.journalId).toBeNull();
      expect(sch.executedAt).toBeNull();
      expect(prisma.journal.update).toHaveBeenCalledWith({
        where: { id: 'jrn-old', organizationId: ORG_A },
        data: { isPosted: false },
      });
      const sl = assets.find((a) => a.id === 'sl')!;
      expect(sl.status).toBe(AssetStatus.ACTIVE);
    });
  });

  describe('missing schedule / asset', () => {
    it('a period with no schedule row is a 404, not a 500', async () => {
      await expect(service.runDepreciationForAsset(ORG_A, 'sl', 1, 2099)).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.runDepreciationForAsset(ORG_A, 'sl', 1, 2099)).rejects.toThrow(
        'No depreciation scheduled for this period',
      );
      expect(prisma.journal.create).not.toHaveBeenCalled();
    });

    it('an unknown asset is a 404, not a 500', async () => {
      await expect(service.runDepreciationForAsset(ORG_A, 'nope', 3, 2026)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('idempotent retries', () => {
    it('a second monthly run for the same period creates no second journal', async () => {
      await service.runMonthlyDepreciation(ORG_A);
      const retry = await service.runMonthlyDepreciation(ORG_A);

      expect(retry).toMatchObject({ processed: 0, journalsCreated: 0 });
      expect(prisma.journal.create).toHaveBeenCalledTimes(3);
      expect(journalFor('sl')).toBeDefined();
    });

    it('a manual run after the monthly run does not post the period twice', async () => {
      await service.runMonthlyDepreciation(ORG_A);

      await expect(service.runDepreciationForAsset(ORG_A, 'sl', 3, 2026)).rejects.toThrow(
        'Depreciation already executed for this period',
      );
      expect(prisma.journal.create).toHaveBeenCalledTimes(3);
    });

    // Root cause was the executedAt check outside the $transaction: both runs read
    // executedAt = null, both posted. The period is now claimed by an in-transaction
    // updateMany({ executedAt: null }) and the loser aborts.
    it('two concurrent manual runs for the same asset and period create one journal', async () => {
      const results = await Promise.allSettled([
        service.runDepreciationForAsset(ORG_A, 'sl', 3, 2026),
        service.runDepreciationForAsset(ORG_A, 'sl', 3, 2026),
      ]);

      expect(results.map((r) => r.status).sort()).toEqual(['fulfilled', 'rejected']);
      expect(
        (results.find((r) => r.status === 'rejected') as PromiseRejectedResult).reason,
      ).toEqual(new Error('Depreciation already executed for this period'));
      expect(prisma.journal.create).toHaveBeenCalledTimes(1);
    });

    it('a monthly run racing a manual run for one period posts one journal', async () => {
      const [monthly, manual] = await Promise.allSettled([
        service.runMonthlyDepreciation(ORG_A),
        service.runDepreciationForAsset(ORG_A, 'sl', 3, 2026),
      ]);

      const slJournals = mock(prisma.journal.create).mock.calls.filter(
        ([a]) => a.data.reference === 'DEP-FA-sl-2026-03',
      );
      expect(slJournals).toHaveLength(1);
      expect(monthly.status).toBe('fulfilled');
      // Whichever lost reports it: monthly skips the asset, manual rejects.
      if (manual.status === 'fulfilled') {
        expect((monthly as PromiseFulfilledResult<{ processed: number }>).value.processed).toBe(2);
      } else {
        expect((monthly as PromiseFulfilledResult<{ processed: number }>).value.processed).toBe(3);
      }
    });

    it('the cron only posts on the last day of the month', async () => {
      mock(prisma.organization.findMany).mockResolvedValue([{ id: ORG_A }]);

      await service.runMonthlyDepreciationCron(); // 15 March
      expect(prisma.organization.findMany).not.toHaveBeenCalled();

      jest.setSystemTime(new Date(2026, 2, 31, 0, 0, 0));
      await service.runMonthlyDepreciationCron();
      expect(prisma.journal.create).toHaveBeenCalledTimes(3);
    });
  });

  describe('tenant scoping', () => {
    it('scopes reads and writes to the organization and never touches org B', async () => {
      await service.runMonthlyDepreciation(ORG_A);

      expect(mock(prisma.asset.findMany).mock.calls[0][0].where.organizationId).toBe(ORG_A);
      for (const [arg] of mock(prisma.journal.findFirst).mock.calls) {
        expect(arg.where.organizationId).toBe(ORG_A);
      }
      for (const [arg] of mock(prisma.journal.create).mock.calls) {
        expect(arg.data.organizationId).toBe(ORG_A);
      }
      const touched = [
        ...mock(prisma.depreciationSchedule.findFirst).mock.calls.map(([a]) => a.where.assetId),
        ...mock(prisma.depreciationSchedule.update).mock.calls.map(([a]) => a.where.id),
        ...mock(prisma.asset.update).mock.calls.map(([a]) => a.where.id),
      ];
      expect(touched).not.toContain('other');
      expect(touched).not.toContain('sch-other-2026-03');
      expect(assets.find((a) => a.id === 'other')!.currentBookValue.toFixed(4)).toBe('1525.0000');
      expect(schedules.find((s) => s.assetId === 'other')!.executedAt).toBeNull();
    });

    it("rejects a manual run on another organization's asset before reading its schedule", async () => {
      await expect(service.runDepreciationForAsset(ORG_A, 'other', 3, 2026)).rejects.toThrow(
        'Asset not found or not active',
      );
      expect(mock(prisma.asset.findFirst).mock.calls[0][0].where).toMatchObject({
        id: 'other',
        organizationId: ORG_A,
      });
      expect(prisma.depreciationSchedule.findFirst).not.toHaveBeenCalled();
      expect(prisma.journal.create).not.toHaveBeenCalled();
    });

    it("cannot reverse another organization's schedule", async () => {
      schedules.find((s) => s.assetId === 'other')!.executedAt = FIXED_NOW;

      await expect(service.reverseDepreciation(ORG_A, 'sch-other-2026-03')).rejects.toThrow(
        'Depreciation schedule not found',
      );
      expect(mock(prisma.depreciationSchedule.findFirst).mock.calls[0][0].where).toEqual({
        id: 'sch-other-2026-03',
        organizationId: ORG_A,
      });
      expect(prisma.depreciationSchedule.update).not.toHaveBeenCalled();
      expect(prisma.journal.update).not.toHaveBeenCalled();
    });

    // Every query on the org-owned models must itself carry organizationId, not rely on
    // a previous read having been scoped.
    it('every schedule, asset and journal query on monthly, manual and reverse paths is org-scoped', async () => {
      schedules.push(
        schedule('sl', '37.5000', '1012.5000', '1487.5000', {
          id: 'sch-sl-2026-02',
          month: 2,
          executedAt: new Date(2026, 1, 28),
          journalId: 'jrn-old',
        }),
      );
      await service.runMonthlyDepreciation(ORG_A);
      await service.runDepreciationForAsset(ORG_A, 'sl', 3, 2026).catch(() => undefined);
      await service.reverseDepreciation(ORG_A, 'sch-sl-2026-02');
      await service.getDepreciationForecast(ORG_A, 1);

      const wheres = [
        prisma.asset.findMany,
        prisma.asset.findFirst,
        prisma.asset.update,
        prisma.depreciationSchedule.findFirst,
        prisma.depreciationSchedule.findMany,
        prisma.depreciationSchedule.updateMany,
        prisma.depreciationSchedule.update,
        prisma.journal.findFirst,
        prisma.journal.update,
      ].flatMap((fn) => mock(fn).mock.calls.map(([arg]) => ({ fn, where: arg.where })));

      expect(wheres.length).toBeGreaterThan(10);
      for (const { where } of wheres) {
        expect(where.organizationId).toBe(ORG_A);
      }
      for (const [arg] of mock(prisma.journal.create).mock.calls) {
        expect(arg.data.organizationId).toBe(ORG_A);
      }
    });
  });
});
