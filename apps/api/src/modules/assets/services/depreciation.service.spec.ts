import { AssetStatus } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import {
  DepreciationTestContext,
  setupDepreciationTestContext,
  mock,
  ORG_A,
  FIXED_NOW,
  schedule,
} from './depreciation.test-fixtures';

describe('DepreciationService', () => {
  let ctx: DepreciationTestContext;

  beforeEach(async () => {
    ctx = await setupDepreciationTestContext();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('runMonthlyDepreciation: journal lines', () => {
    it('posts straight-line 37.5000: Dr expense, Cr accumulated depreciation', async () => {
      const result = await ctx.service.runMonthlyDepreciation(ORG_A);

      expect(result).toMatchObject({
        processed: 3,
        journalsCreated: 3,
        totalDepreciation: expect.closeTo(37.5 + 333.3333 + 12.3456, 4),
      });

      const slJournal = ctx.journalFor('sl');
      expect(slJournal).toMatchObject({
        journalNumber: 'JRN-042',
        reference: 'DEP-FA-sl-2026-03',
        isPosted: true,
        organizationId: ORG_A,
      });
      expect(ctx.lines(slJournal)).toEqual([
        { accountId: 'exp-sl', debit: '37.5000', credit: '0.0000' },
        { accountId: 'accdep-sl', debit: '0.0000', credit: '37.5000' },
      ]);
    });

    it('posts the declining-balance amount 333.3333 exactly', async () => {
      await ctx.service.runMonthlyDepreciation(ORG_A);

      const dbJournal = ctx.journalFor('db');
      expect(ctx.lines(dbJournal)).toEqual([
        { accountId: 'exp-db', debit: '333.3333', credit: '0.0000' },
        { accountId: 'accdep-db', debit: '0.0000', credit: '333.3333' },
      ]);
      const dbAsset = ctx.assets.find((a) => a.id === 'db')!;
      expect(dbAsset.currentBookValue.toFixed(4)).toBe('9666.6667');
      expect(dbAsset.accumulatedDepreciation.toFixed(4)).toBe('333.3333');
    });

    it('final period posts the residual so book value lands exactly on salvage', async () => {
      await ctx.service.runMonthlyDepreciation(ORG_A);

      const lastAsset = ctx.assets.find((a) => a.id === 'last')!;
      expect(lastAsset.currentBookValue.toFixed(4)).toBe('1000.0000');
      expect(lastAsset.status).toBe(AssetStatus.FULLY_DEPRECIATED);
    });
  });

  describe('runDepreciationForAsset: journal lines', () => {
    it('posts the requested period dated on its first day', async () => {
      const res = await ctx.service.runDepreciationForAsset(ORG_A, 'sl', 3, 2026);

      expect(res.amount).toBe(37.5);
      const slJournal = ctx.journalFor('sl');
      expect(slJournal.date).toEqual(new Date(2026, 2, 1));
    });

    it('final period via manual run lands book value on salvage and marks FULLY_DEPRECIATED', async () => {
      await ctx.service.runDepreciationForAsset(ORG_A, 'last', 3, 2026);

      const lastAsset = ctx.assets.find((a) => a.id === 'last')!;
      expect(lastAsset.currentBookValue.toFixed(4)).toBe('1000.0000');
      expect(lastAsset.status).toBe(AssetStatus.FULLY_DEPRECIATED);
    });

    it('posts manual straight-line depreciation with balanced debit and credit', async () => {
      await ctx.service.runDepreciationForAsset(ORG_A, 'sl', 3, 2026);

      const slJournal = ctx.journalFor('sl');
      expect(ctx.lines(slJournal)).toEqual([
        { accountId: 'exp-sl', debit: '37.5000', credit: '0.0000' },
        { accountId: 'accdep-sl', debit: '0.0000', credit: '37.5000' },
      ]);
    });

    it('queries schedule entry via findUnique composite key with organization scoping', async () => {
      await ctx.service.runDepreciationForAsset(ORG_A, 'sl', 3, 2026);

      expect(ctx.prisma.depreciationSchedule.findUnique).toHaveBeenCalledWith({
        where: {
          assetId_month_year: {
            assetId: 'sl',
            month: 3,
            year: 2026,
          },
          organizationId: ORG_A,
        },
      });
    });

    it('uses today timestamp consistently for executedAt when claiming period', async () => {
      const initialTime = FIXED_NOW;
      // Advance fake timers during asset lookup to prove executedAt uses the entry timestamp
      mock(ctx.prisma.asset.findFirst).mockImplementationOnce(async ({ where }) => {
        jest.advanceTimersByTime(5000);
        return ctx.assets.find((a) => a.id === where.id) ?? null;
      });

      await ctx.service.runDepreciationForAsset(ORG_A, 'sl', 3, 2026);

      const claimCall = mock(ctx.prisma.depreciationSchedule.updateMany).mock.calls.find(
        ([arg]) => arg.where.id === 'sch-sl-2026-03',
      );
      expect(claimCall).toBeDefined();
      expect(claimCall![0].data.executedAt).toEqual(initialTime);
    });
  });

  describe('reverseDepreciation', () => {
    it('voids journal entry and restores asset book value and schedule state', async () => {
      ctx.schedules.push(
        schedule('sl', '37.5000', '1012.5000', '1487.5000', {
          id: 'sch-sl-2026-02',
          month: 2,
          executedAt: new Date(2026, 1, 28),
          journalId: 'jrn-old',
        }),
      );
      await ctx.service.reverseDepreciation(ORG_A, 'sch-sl-2026-02');

      const sch = ctx.schedules.find((s) => s.id === 'sch-sl-2026-02')!;
      expect(sch.journalId).toBeNull();
      expect(sch.executedAt).toBeNull();
      expect(ctx.prisma.journal.update).toHaveBeenCalledWith({
        where: { id: 'jrn-old', organizationId: ORG_A },
        data: { isPosted: false },
      });
      const sl = ctx.assets.find((a) => a.id === 'sl')!;
      expect(sl.status).toBe(AssetStatus.ACTIVE);
    });

    it('restores state without throwing even if the previous executed schedule was inconsistent', async () => {
      ctx.schedules.push(
        schedule('sl', '37.5000', '1012.5000', '1487.5000', {
          id: 'sch-sl-2026-02',
          month: 2,
          executedAt: new Date(2026, 1, 28),
          journalId: 'jrn-old',
        }),
        schedule('sl', '37.5000', '-50.0000', '200.0000', {
          id: 'sch-sl-2026-01',
          month: 1,
          executedAt: new Date(2026, 0, 31),
          journalId: 'jrn-prior',
        }),
      );

      // Reversal should succeed and not block remediation
      await expect(
        ctx.service.reverseDepreciation(ORG_A, 'sch-sl-2026-02'),
      ).resolves.toBeUndefined();

      const sl = ctx.assets.find((a) => a.id === 'sl')!;
      expect(sl.accumulatedDepreciation).toEqual(new Decimal('-50.0000'));
      expect(sl.currentBookValue).toEqual(new Decimal('200.0000'));
      expect(sl.status).toBe(AssetStatus.ACTIVE);
    });
  });
});
