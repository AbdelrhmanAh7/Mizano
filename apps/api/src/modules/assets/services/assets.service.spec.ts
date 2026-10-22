import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AccountType, AssetStatus, AssetType, DepreciationMethod, Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { AssetsService } from './assets.service';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  expectBalanced,
  realJournalsService,
  writtenJournals,
} from '../../../test/helpers/ledger.helpers';
import { createMockPrisma, MockPrismaClient } from '../../../test/mocks/prisma.mock';
import { JournalsService } from '../../accounting/services/journals.service';

function createMockAsset(overrides: Record<string, unknown> = {}) {
  return {
    id: 'asset-test-001',
    assetNumber: 'AST-001',
    name: 'Test Laptop',
    description: 'A test laptop',
    assetType: AssetType.ELECTRONICS,
    purchaseDate: new Date('2024-01-01'),
    purchasePrice: new Decimal('2500.00'),
    salvageValue: new Decimal('250.00'),
    usefulLifeYears: 5,
    depreciationMethod: DepreciationMethod.STRAIGHT_LINE,
    monthlyDepreciation: new Decimal('37.50'),
    accumulatedDepreciation: new Decimal('0.00'),
    currentBookValue: new Decimal('2500.00'),
    status: AssetStatus.ACTIVE,
    disposalDate: null,
    disposalAmount: null,
    disposalGainLoss: null,
    assetAccountId: 'account-001',
    depreciationAccountId: 'account-002',
    accumulatedDeprAccountId: 'account-003',
    organizationId: 'org-test-001',
    deletedAt: null,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  };
}

describe('AssetsService', () => {
  let service: AssetsService;
  let prisma: MockPrismaClient;

  const ORG_ID = 'org-test-001';

  beforeEach(async () => {
    prisma = createMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AssetsService,
        { provide: PrismaService, useValue: prisma },
        { provide: JournalsService, useValue: {} },
      ],
    }).compile();

    service = module.get<AssetsService>(AssetsService);
  });

  describe('findAll', () => {
    it('should return a list of assets with numeric monetary values', async () => {
      const mockAsset = createMockAsset();
      prisma.asset.findMany.mockResolvedValue([mockAsset] as any);
      prisma.asset.count.mockResolvedValue(1);

      const result = await service.findAll(ORG_ID, {});

      expect(result.total).toBe(1);
      expect(result.data).toHaveLength(1);

      const asset = result.data[0] as Record<string, unknown>;
      expect(typeof asset['purchasePrice']).toBe('number');
      expect(asset['purchasePrice']).toBe(2500);
      expect(typeof asset['currentBookValue']).toBe('number');
      expect(asset['currentBookValue']).toBe(2500);
      expect(typeof asset['monthlyDepreciation']).toBe('number');
      expect(asset['monthlyDepreciation']).toBe(37.5);
    });

    // Regression test: passing this.formatAssetResponse directly to map() loses `this` context,
    // causing "Cannot read properties of undefined (reading 'toNum')" at runtime.
    it('should not throw when mapping multiple assets (this-binding regression)', async () => {
      const assets = [
        createMockAsset({ id: 'asset-001', assetNumber: 'AST-001' }),
        createMockAsset({ id: 'asset-002', assetNumber: 'AST-002' }),
        createMockAsset({ id: 'asset-003', assetNumber: 'AST-003' }),
      ];
      prisma.asset.findMany.mockResolvedValue(assets as any);
      prisma.asset.count.mockResolvedValue(3);

      await expect(service.findAll(ORG_ID, {})).resolves.not.toThrow();

      const result = await service.findAll(ORG_ID, {});
      expect(result.data).toHaveLength(3);
    });

    it('should handle null optional monetary fields without throwing', async () => {
      const assetWithNulls = createMockAsset({
        disposalAmount: null,
        disposalGainLoss: null,
      });
      prisma.asset.findMany.mockResolvedValue([assetWithNulls] as any);
      prisma.asset.count.mockResolvedValue(1);

      const result = await service.findAll(ORG_ID, {});
      const asset = result.data[0] as Record<string, unknown>;

      expect(asset['disposalAmount']).toBeUndefined();
      expect(asset['disposalGainLoss']).toBeUndefined();
    });

    it('should return empty data array when no assets exist', async () => {
      prisma.asset.findMany.mockResolvedValue([]);
      prisma.asset.count.mockResolvedValue(0);

      const result = await service.findAll(ORG_ID, {});

      expect(result.data).toHaveLength(0);
      expect(result.total).toBe(0);
    });

    it('should filter by status when provided', async () => {
      prisma.asset.findMany.mockResolvedValue([]);
      prisma.asset.count.mockResolvedValue(0);

      await service.findAll(ORG_ID, { status: AssetStatus.ACTIVE });

      expect(prisma.asset.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: AssetStatus.ACTIVE,
            organizationId: ORG_ID,
          }),
        }),
      );
    });

    it('should filter by assetType when provided', async () => {
      prisma.asset.findMany.mockResolvedValue([]);
      prisma.asset.count.mockResolvedValue(0);

      await service.findAll(ORG_ID, { assetType: AssetType.VEHICLES });

      expect(prisma.asset.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            assetType: AssetType.VEHICLES,
            organizationId: ORG_ID,
          }),
        }),
      );
    });

    it('should always filter by organizationId', async () => {
      prisma.asset.findMany.mockResolvedValue([]);
      prisma.asset.count.mockResolvedValue(0);

      await service.findAll(ORG_ID, {});

      const callArgs = prisma.asset.findMany.mock.calls[0][0];
      const whereArg = callArgs?.where;
      expect(whereArg!.organizationId).toBe(ORG_ID);
      expect(whereArg!.deletedAt).toBeNull();
    });
  });

  describe('create (#130)', () => {
    it('builds a Decimal schedule whose last period absorbs the rounding remainder', async () => {
      prisma.asset.findFirst.mockResolvedValue(null);
      prisma.asset.create.mockResolvedValue(createMockAsset() as never);

      await service.create(ORG_ID, {
        name: 'Laptop',
        assetType: AssetType.ELECTRONICS,
        purchaseDate: '2026-01-15',
        purchasePrice: 1000,
        salvageValue: 0,
        usefulLifeYears: 1,
        assetAccountId: 'a',
        depreciationAccountId: 'b',
        accumulatedDeprAccountId: 'c',
      });

      const rows = prisma.depreciationSchedule.createMany.mock.calls[0][0]!
        .data as Prisma.DepreciationScheduleCreateManyInput[];
      expect(rows).toHaveLength(12);
      const amounts = rows.map((r) => new Decimal(String(r.amount)));
      expect(amounts[0].toFixed(2)).toBe('83.33');
      expect(amounts[11].toFixed(2)).toBe('83.37');
      expect(amounts.reduce((s, a) => s.add(a), new Decimal(0)).toFixed(4)).toBe('1000.0000');
      expect(String(rows[11].bookValue)).toBe('0');
    });
  });

  describe('dispose (#130)', () => {
    const asset = createMockAsset({
      accumulatedDepreciation: new Decimal('500'),
      currentBookValue: new Decimal('2000'),
    });

    type AccountResolver = (args: Prisma.AccountFindFirstArgs) => { id: string } | null;

    const isCashQuery = (args: Prisma.AccountFindFirstArgs): boolean =>
      !!args.where?.code && typeof args.where.code === 'object' && 'startsWith' in args.where.code;
    const accountQueries = (): Prisma.AccountFindFirstArgs[] =>
      prisma.account.findFirst.mock.calls.map(([args]) => args as Prisma.AccountFindFirstArgs);
    const gainLossQueries = (): Prisma.AccountFindFirstArgs[] =>
      accountQueries().filter((args) => !isCashQuery(args));

    function disposeWith(
      opts: {
        lockDate?: Date | null;
        asset?: ReturnType<typeof createMockAsset>;
        disposalAmount?: number;
        resolve?: AccountResolver;
      } = {},
    ): Promise<unknown> {
      const target = opts.asset ?? asset;
      const resolve: AccountResolver =
        opts.resolve ??
        ((args) => (isCashQuery(args) ? { id: 'acc-cash' } : { id: 'acc-gain-loss' }));
      const journals = realJournalsService(prisma, opts.lockDate ?? null);
      const disposer = new AssetsService(prisma as unknown as PrismaService, journals);
      prisma.asset.findFirst.mockResolvedValue(target as never);
      prisma.asset.updateMany.mockResolvedValue({ count: 1 });
      prisma.asset.findUniqueOrThrow.mockResolvedValue(target as never);
      prisma.account.findFirst.mockImplementation(((args: Prisma.AccountFindFirstArgs) =>
        Promise.resolve(isCashQuery(args) ? { id: 'acc-cash' } : resolve(args))) as never);
      return disposer.dispose(ORG_ID, target.id, {
        disposalDate: '2026-06-15',
        disposalAmount: opts.disposalAmount ?? 1500,
      });
    }

    it('posts one balanced ASSET_DISPOSAL journal under the ledger lock and marks the asset disposed', async () => {
      await disposeWith();

      const [journal, ...rest] = writtenJournals(prisma);
      expect(rest).toHaveLength(0);
      expectBalanced(journal.lines);
      expect(journal.sourceType).toBe('ASSET_DISPOSAL');
      expect(journal.sourceId).toBe(asset.id);
      expect(journal.date.toISOString()).toBe('2026-06-15T00:00:00.000Z');
      const debit = (id: string) => journal.lines.find((l) => l.accountId === id)?.debit;
      expect(debit('acc-cash')?.toFixed(2)).toBe('1500.00');
      expect(debit(asset.accumulatedDeprAccountId)?.toFixed(2)).toBe('500.00');
      expect(debit('acc-gain-loss')?.toFixed(2)).toBe('500.00');
    });

    it('rejects the disposal when the lock date covers the disposal date', async () => {
      await expect(disposeWith({ lockDate: new Date('2026-06-30T00:00:00.000Z') })).rejects.toThrow(
        /locked/,
      );
      expect(prisma.journal.create).not.toHaveBeenCalled();
    });

    it('rejects instead of dropping the loss line when no gain/loss account exists', async () => {
      await expect(
        disposeWith({ resolve: (args) => (isCashQuery(args) ? { id: 'acc-cash' } : null) }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.journal.create).not.toHaveBeenCalled();
    });

    it('disposes a fully depreciated asset', async () => {
      const fullyDepreciated = createMockAsset({
        status: AssetStatus.FULLY_DEPRECIATED,
        accumulatedDepreciation: new Decimal('2250'),
        currentBookValue: new Decimal('250'),
        salvageValue: new Decimal('250'),
      });

      await disposeWith({ asset: fullyDepreciated, disposalAmount: 100 });

      const [journal, ...rest] = writtenJournals(prisma);
      expect(rest).toHaveLength(0);
      expect(journal.sourceType).toBe('ASSET_DISPOSAL');
      expectBalanced(journal.lines);
      const updateWhere = prisma.asset.updateMany.mock.calls[0][0].where;
      expect(updateWhere?.status).toEqual({
        in: [AssetStatus.ACTIVE, AssetStatus.FULLY_DEPRECIATED],
      });
    });

    it('rejects an asset in a non-disposable status', async () => {
      const disposed = createMockAsset({ status: AssetStatus.DISPOSED });

      await expect(disposeWith({ asset: disposed })).rejects.toThrow(BadRequestException);
      await expect(disposeWith({ asset: disposed })).rejects.toThrow(
        /cannot be disposed in status DISPOSED/,
      );
      expect(prisma.asset.updateMany).not.toHaveBeenCalled();
      expect(prisma.journal.create).not.toHaveBeenCalled();
    });

    it('credits a gain to income account 7100 when the chart has it', async () => {
      await disposeWith({
        disposalAmount: 2300,
        resolve: (args) => (args.where?.code === '7100' ? { id: 'acc-7100' } : { id: 'acc-other' }),
      });

      const query = gainLossQueries().find((args) => args.where?.code === '7100');
      expect(query?.where).toMatchObject({
        organizationId: ORG_ID,
        deletedAt: null,
        isActive: true,
        type: { in: [AccountType.INCOME, AccountType.REVENUE] },
      });
      const [journal] = writtenJournals(prisma);
      expectBalanced(journal.lines);
      const gainLine = journal.lines.find((l) => l.accountId === 'acc-7100');
      expect(gainLine?.credit.toFixed(2)).toBe('300.00');
      expect(gainLine?.debit.toFixed(2)).toBe('0.00');
      expect(journal.lines.some((l) => l.accountId === 'acc-other')).toBe(false);
    });

    it('falls back to the highest-coded income account for a gain', async () => {
      await disposeWith({
        disposalAmount: 2300,
        resolve: (args) => (args.where?.code === '7100' ? null : { id: 'acc-income' }),
      });

      const fallback = gainLossQueries().find((args) => args.where?.code === undefined);
      expect(fallback?.where?.type).toEqual({ in: [AccountType.INCOME, AccountType.REVENUE] });
      expect(fallback?.where?.isActive).toBe(true);
      expect(fallback?.orderBy).toEqual({ code: 'desc' });
      const [journal] = writtenJournals(prisma);
      expectBalanced(journal.lines);
      const gainLine = journal.lines.find((l) => l.accountId === 'acc-income');
      expect(gainLine?.credit.toFixed(2)).toBe('300.00');
    });

    it('debits a loss to the highest-coded expense account and never looks up 6100', async () => {
      await disposeWith({ resolve: () => ({ id: 'acc-expense' }) });

      const queries = gainLossQueries();
      expect(queries).toHaveLength(1);
      expect(queries[0].where).toMatchObject({
        organizationId: ORG_ID,
        deletedAt: null,
        isActive: true,
        type: AccountType.EXPENSE,
      });
      expect(queries[0].orderBy).toEqual({ code: 'desc' });
      expect(JSON.stringify(accountQueries())).not.toContain('6100');
      const [journal] = writtenJournals(prisma);
      expectBalanced(journal.lines);
      const lossLine = journal.lines.find((l) => l.accountId === 'acc-expense');
      expect(lossLine?.debit.toFixed(2)).toBe('500.00');
      expect(lossLine?.credit.toFixed(2)).toBe('0.00');
    });
  });
});
