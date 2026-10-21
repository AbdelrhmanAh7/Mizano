import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AssetStatus, AssetType, DepreciationMethod } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { AssetsService } from './assets.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { createMockPrisma, MockPrismaClient } from '../../../test/mocks/prisma.mock';

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
      providers: [AssetsService, { provide: PrismaService, useValue: prisma }],
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

  describe('create account ownership', () => {
    const dto = {
      name: 'Rack',
      assetType: AssetType.ELECTRONICS,
      purchaseDate: '2025-01-15',
      purchasePrice: 12000,
      salvageValue: 2000,
      usefulLifeYears: 5,
      assetAccountId: 'account-001',
      depreciationAccountId: 'account-002',
      accumulatedDeprAccountId: 'account-003',
    };

    it('rejects (400) an account that is not one of the organization accounts, writing nothing', async () => {
      prisma.account.count.mockResolvedValue(2);

      await expect(service.create(ORG_ID, dto)).rejects.toThrow(BadRequestException);
      await expect(service.create(ORG_ID, dto)).rejects.toThrow(/Account not found/);
      expect(prisma.account.count.mock.calls[0]![0]!.where).toMatchObject({
        id: { in: ['account-001', 'account-002', 'account-003'] },
        organizationId: ORG_ID,
        deletedAt: null,
      });
      expect(prisma.asset.create).not.toHaveBeenCalled();
    });

    it('counts a repeated account id once', async () => {
      prisma.account.count.mockResolvedValue(2);
      prisma.asset.findFirst.mockResolvedValue(null);
      prisma.asset.create.mockResolvedValue(createMockAsset() as never);
      prisma.depreciationSchedule.createMany.mockResolvedValue({ count: 60 });

      await service.create(ORG_ID, { ...dto, depreciationAccountId: 'account-001' });

      expect(prisma.account.count.mock.calls[0]![0]!.where).toMatchObject({
        id: { in: ['account-001', 'account-003'] },
      });
      expect(prisma.asset.create).toHaveBeenCalledTimes(1);
    });
  });
});
