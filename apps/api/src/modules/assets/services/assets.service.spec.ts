import { Test, TestingModule } from '@nestjs/testing';
import { AssetStatus, AssetType, DepreciationMethod } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { AssetsService } from './assets.service';
import { PrismaService } from '../../../prisma/prisma.service';
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
  let journalsService: { create: jest.Mock };

  const ORG_ID = 'org-test-001';

  beforeEach(async () => {
    prisma = createMockPrisma();
    journalsService = { create: jest.fn().mockResolvedValue({ id: 'journal-1' }) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AssetsService,
        { provide: PrismaService, useValue: prisma },
        { provide: JournalsService, useValue: journalsService },
      ],
    }).compile();

    service = module.get<AssetsService>(AssetsService);
  });

  describe('dispose', () => {
    it('creates a source-linked disposal journal through JournalsService in the transaction', async () => {
      const asset = createMockAsset({
        currentBookValue: new Decimal('2000'),
        accumulatedDepreciation: new Decimal('500'),
        status: AssetStatus.ACTIVE,
      });
      prisma.asset.findFirst.mockResolvedValue(asset as never);
      prisma.asset.updateMany.mockResolvedValue({ count: 1 } as never);
      prisma.asset.findFirstOrThrow.mockResolvedValue({
        ...asset,
        status: AssetStatus.DISPOSED,
      } as never);
      prisma.depreciationSchedule.deleteMany.mockResolvedValue({ count: 0 } as never);
      prisma.account.findFirst
        .mockResolvedValueOnce({ id: 'gain-loss' } as never)
        .mockResolvedValueOnce({ id: 'cash' } as never);

      await service.dispose(ORG_ID, asset.id, {
        disposalAmount: 2000,
        disposalDate: '2026-10-03',
      });

      expect(journalsService.create).toHaveBeenCalledWith(
        ORG_ID,
        expect.objectContaining({
          date: '2026-10-03T00:00:00.000Z',
          lines: expect.arrayContaining([
            expect.objectContaining({ accountId: 'cash', debit: '2000.0000' }),
            expect.objectContaining({ accountId: asset.assetAccountId, credit: '2500.0000' }),
          ]),
        }),
        expect.objectContaining({
          tx: prisma,
          source: { type: 'ASSET_DISPOSAL', id: asset.id },
        }),
      );
      expect(prisma.journal.create).not.toHaveBeenCalled();
      expect(prisma.asset.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: asset.id,
            organizationId: ORG_ID,
            deletedAt: null,
            status: AssetStatus.ACTIVE,
          },
        }),
      );
    });
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

      const whereArg = prisma.asset.findMany.mock.calls[0]![0]!.where;
      expect(whereArg!.status).toBe(AssetStatus.ACTIVE);
    });

    it('should filter by assetType when provided', async () => {
      prisma.asset.findMany.mockResolvedValue([]);
      prisma.asset.count.mockResolvedValue(0);

      await service.findAll(ORG_ID, { assetType: AssetType.ELECTRONICS });

      const whereArg = prisma.asset.findMany.mock.calls[0]![0]!.where;
      expect(whereArg!.assetType).toBe(AssetType.ELECTRONICS);
    });

    it('should always filter by organizationId', async () => {
      prisma.asset.findMany.mockResolvedValue([]);
      prisma.asset.count.mockResolvedValue(0);

      await service.findAll(ORG_ID, {});

      const whereArg = prisma.asset.findMany.mock.calls[0]![0]!.where;
      expect(whereArg!.organizationId).toBe(ORG_ID);
      expect(whereArg!.deletedAt).toBeNull();
    });
  });
});
