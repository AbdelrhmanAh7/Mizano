import { Decimal } from '@prisma/client/runtime/library';
import {
  DepreciationTestContext,
  setupDepreciationTestContext,
  mock,
  ORG_A,
  FIXED_NOW,
  schedule,
} from './depreciation.test-fixtures';

describe('DepreciationService - Validation, Idempotency & Tenant Scoping', () => {
  let ctx: DepreciationTestContext;

  beforeEach(async () => {
    ctx = await setupDepreciationTestContext();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('schedule value consistency validation', () => {
    it('rejects manual depreciation when schedule book value is less than asset salvage value', async () => {
      const sch = ctx.schedules.find((s) => s.assetId === 'sl')!;
      sch.bookValue = new Decimal('200.0000'); // salvage is 250.0000
      sch.accumulatedTotal = new Decimal('2300.0000');

      await expect(ctx.service.runDepreciationForAsset(ORG_A, 'sl', 3, 2026)).rejects.toThrow(
        /less than asset salvage value/,
      );
      expect(ctx.prisma.journal.create).not.toHaveBeenCalled();
    });

    it('rejects manual depreciation when schedule book value exceeds asset purchase price', async () => {
      const sch = ctx.schedules.find((s) => s.assetId === 'sl')!;
      sch.bookValue = new Decimal('2600.0000'); // exceeds 2500 purchase price

      await expect(ctx.service.runDepreciationForAsset(ORG_A, 'sl', 3, 2026)).rejects.toThrow(
        /cannot exceed asset purchase price/,
      );
      expect(ctx.prisma.journal.create).not.toHaveBeenCalled();
    });

    it('rejects manual depreciation when accumulated depreciation is negative', async () => {
      const sch = ctx.schedules.find((s) => s.assetId === 'sl')!;
      sch.accumulatedTotal = new Decimal('-10.0000');
      sch.bookValue = new Decimal('2510.0000');

      await expect(ctx.service.runDepreciationForAsset(ORG_A, 'sl', 3, 2026)).rejects.toThrow(
        /cannot be negative/,
      );
      expect(ctx.prisma.journal.create).not.toHaveBeenCalled();
    });

    it('skips corrupted asset in monthly depreciation before transaction without updating asset or creating journal', async () => {
      const sch = ctx.schedules.find((s) => s.assetId === 'sl')!;
      sch.bookValue = new Decimal('200.0000'); // corrupted: below salvage value

      const result = await ctx.service.runMonthlyDepreciation(ORG_A);

      // Only db and last succeed, sl is skipped
      expect(result.processed).toBe(2);
      expect(result.journalsCreated).toBe(2);
      const slAsset = ctx.assets.find((a) => a.id === 'sl')!;
      expect(slAsset.currentBookValue.toFixed(4)).toBe('1525.0000'); // unchanged initial book value
    });
  });

  describe('idempotent retries', () => {
    it('a second monthly run for the same period creates no second journal', async () => {
      await ctx.service.runMonthlyDepreciation(ORG_A);
      const retry = await ctx.service.runMonthlyDepreciation(ORG_A);

      expect(retry).toMatchObject({ processed: 0, journalsCreated: 0 });
      expect(ctx.prisma.journal.create).toHaveBeenCalledTimes(3);
      expect(ctx.journalFor('sl')).toBeDefined();
    });

    it('a manual run after the monthly run does not post the period twice', async () => {
      await ctx.service.runMonthlyDepreciation(ORG_A);

      await expect(ctx.service.runDepreciationForAsset(ORG_A, 'sl', 3, 2026)).rejects.toThrow(
        'Depreciation already executed for this period',
      );
      expect(ctx.prisma.journal.create).toHaveBeenCalledTimes(3);
    });

    it('two concurrent manual runs for the same asset and period create one journal', async () => {
      const results = await Promise.allSettled([
        ctx.service.runDepreciationForAsset(ORG_A, 'sl', 3, 2026),
        ctx.service.runDepreciationForAsset(ORG_A, 'sl', 3, 2026),
      ]);

      expect(results.map((r) => r.status).sort()).toEqual(['fulfilled', 'rejected']);
      expect(
        (results.find((r) => r.status === 'rejected') as PromiseRejectedResult).reason,
      ).toEqual(new Error('Depreciation already executed for this period'));
      expect(ctx.prisma.journal.create).toHaveBeenCalledTimes(1);
    });

    it('a monthly run racing a manual run for one period posts one journal', async () => {
      const [monthly, manual] = await Promise.allSettled([
        ctx.service.runMonthlyDepreciation(ORG_A),
        ctx.service.runDepreciationForAsset(ORG_A, 'sl', 3, 2026),
      ]);

      const slJournals = mock(ctx.prisma.journal.create).mock.calls.filter(
        ([a]) => a.data.reference === 'DEP-FA-sl-2026-03',
      );
      expect(slJournals).toHaveLength(1);
      expect(monthly.status).toBe('fulfilled');
      if (manual.status === 'fulfilled') {
        expect((monthly as PromiseFulfilledResult<{ processed: number }>).value.processed).toBe(2);
      } else {
        expect((monthly as PromiseFulfilledResult<{ processed: number }>).value.processed).toBe(3);
      }
    });

    it('the cron only posts on the last day of the month', async () => {
      mock(ctx.prisma.organization.findMany).mockResolvedValue([{ id: ORG_A }]);

      await ctx.service.runMonthlyDepreciationCron(); // 15 March
      expect(ctx.prisma.organization.findMany).not.toHaveBeenCalled();

      jest.setSystemTime(new Date(2026, 2, 31, 0, 0, 0));
      await ctx.service.runMonthlyDepreciationCron();
      expect(ctx.prisma.journal.create).toHaveBeenCalledTimes(3);
    });
  });

  describe('tenant scoping', () => {
    it('scopes reads and writes to the organization and never touches org B', async () => {
      await ctx.service.runMonthlyDepreciation(ORG_A);

      expect(mock(ctx.prisma.asset.findMany).mock.calls[0][0].where.organizationId).toBe(ORG_A);
      for (const [arg] of mock(ctx.prisma.journal.findFirst).mock.calls) {
        expect(arg.where.organizationId).toBe(ORG_A);
      }
      for (const [arg] of mock(ctx.prisma.journal.create).mock.calls) {
        expect(arg.data.organizationId).toBe(ORG_A);
      }
      const touched = [
        ...mock(ctx.prisma.depreciationSchedule.findUnique).mock.calls.map(
          ([a]) => a.where.assetId_month_year?.assetId,
        ),
        ...mock(ctx.prisma.depreciationSchedule.findFirst).mock.calls.map(([a]) => a.where.assetId),
        ...mock(ctx.prisma.depreciationSchedule.update).mock.calls.map(([a]) => a.where.id),
        ...mock(ctx.prisma.asset.update).mock.calls.map(([a]) => a.where.id),
      ];
      expect(touched).not.toContain('other');
      expect(touched).not.toContain('sch-other-2026-03');
      expect(ctx.assets.find((a) => a.id === 'other')!.currentBookValue.toFixed(4)).toBe(
        '1525.0000',
      );
      expect(ctx.schedules.find((s) => s.assetId === 'other')!.executedAt).toBeNull();
    });

    it("rejects a manual run on another organization's asset before reading its schedule", async () => {
      await expect(ctx.service.runDepreciationForAsset(ORG_A, 'other', 3, 2026)).rejects.toThrow(
        'Asset not found or not active',
      );
      expect(mock(ctx.prisma.asset.findFirst).mock.calls[0][0].where).toMatchObject({
        id: 'other',
        organizationId: ORG_A,
      });
      expect(ctx.prisma.depreciationSchedule.findUnique).not.toHaveBeenCalled();
      expect(ctx.prisma.depreciationSchedule.findFirst).not.toHaveBeenCalled();
      expect(ctx.prisma.journal.create).not.toHaveBeenCalled();
    });

    it("cannot reverse another organization's schedule", async () => {
      ctx.schedules.find((s) => s.assetId === 'other')!.executedAt = FIXED_NOW;

      await expect(ctx.service.reverseDepreciation(ORG_A, 'sch-other-2026-03')).rejects.toThrow(
        'Depreciation schedule not found',
      );
      expect(mock(ctx.prisma.depreciationSchedule.findUnique).mock.calls[0][0].where).toEqual({
        id: 'sch-other-2026-03',
        organizationId: ORG_A,
      });
      expect(ctx.prisma.depreciationSchedule.update).not.toHaveBeenCalled();
      expect(ctx.prisma.journal.update).not.toHaveBeenCalled();
    });

    it('every schedule, asset and journal query on monthly, manual and reverse paths is org-scoped', async () => {
      ctx.schedules.push(
        schedule('sl', '37.5000', '1012.5000', '1487.5000', {
          id: 'sch-sl-2026-02',
          month: 2,
          executedAt: new Date(2026, 1, 28),
          journalId: 'jrn-old',
        }),
      );
      await ctx.service.runMonthlyDepreciation(ORG_A);
      await ctx.service.runDepreciationForAsset(ORG_A, 'sl', 3, 2026).catch(() => undefined);
      await ctx.service.reverseDepreciation(ORG_A, 'sch-sl-2026-02');
      await ctx.service.getDepreciationForecast(ORG_A, 1);

      const wheres = [
        ctx.prisma.asset.findMany,
        ctx.prisma.asset.findFirst,
        ctx.prisma.asset.update,
        ctx.prisma.depreciationSchedule.findUnique,
        ctx.prisma.depreciationSchedule.findMany,
        ctx.prisma.depreciationSchedule.updateMany,
        ctx.prisma.depreciationSchedule.update,
        ctx.prisma.journal.findFirst,
        ctx.prisma.journal.update,
      ].flatMap((fn) => mock(fn).mock.calls.map(([arg]) => ({ fn, where: arg.where })));

      expect(wheres.length).toBeGreaterThan(10);
      for (const { where } of wheres) {
        expect(where.organizationId).toBe(ORG_A);
      }
      for (const [arg] of mock(ctx.prisma.journal.create).mock.calls) {
        expect(arg.data.organizationId).toBe(ORG_A);
      }
    });
  });
});
