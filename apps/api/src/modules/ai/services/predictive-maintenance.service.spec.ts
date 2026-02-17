import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { PredictiveMaintenanceService } from './predictive-maintenance.service';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  createMockPrisma,
  MockPrismaClient,
  TEST_ORG_ID,
  mockDecimal,
} from '../__tests__/fixtures/ai-test-helpers';

describe('PredictiveMaintenanceService', () => {
  let service: PredictiveMaintenanceService;
  let prisma: MockPrismaClient;

  beforeEach(async () => {
    prisma = createMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [PredictiveMaintenanceService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<PredictiveMaintenanceService>(PredictiveMaintenanceService);
  });

  describe('predictAssetHealth', () => {
    it('should return HIGH health score for a new asset', async () => {
      prisma.asset.findFirst.mockResolvedValue({
        id: 'asset-001',
        name: 'New Laptop',
        purchaseDate: new Date(), // purchased today
        purchasePrice: mockDecimal(1500),
        accumulatedDepreciation: mockDecimal(0),
        currentBookValue: mockDecimal(1500),
        salvageValue: mockDecimal(200),
        usefulLifeYears: 5,
        status: 'ACTIVE',
        organizationId: TEST_ORG_ID,
      } as any);

      prisma.depreciationSchedule.findMany.mockResolvedValue([] as any);
      prisma.assetMaintenancePrediction.findFirst.mockResolvedValue(null as any);
      prisma.assetMaintenancePrediction.upsert.mockResolvedValue({} as any);

      const result = await service.predictAssetHealth(TEST_ORG_ID, 'asset-001');

      expect(result.assetName).toBe('New Laptop');
      expect(result.healthScore).toBeGreaterThanOrEqual(0.8);
      expect(result.riskScore).toBeLessThanOrEqual(0.2);
      expect(result.recommendedAction).toContain('No immediate action');
    });

    it('should return LOWER health score for old asset with high depreciation', async () => {
      const fiveYearsAgo = new Date();
      fiveYearsAgo.setFullYear(fiveYearsAgo.getFullYear() - 5);

      prisma.asset.findFirst.mockResolvedValue({
        id: 'asset-002',
        name: 'Old Server',
        purchaseDate: fiveYearsAgo,
        purchasePrice: mockDecimal(10000),
        accumulatedDepreciation: mockDecimal(9000),
        currentBookValue: mockDecimal(1000),
        salvageValue: mockDecimal(500),
        usefulLifeYears: 5,
        status: 'ACTIVE',
        organizationId: TEST_ORG_ID,
      } as any);

      prisma.depreciationSchedule.findMany.mockResolvedValue([] as any);
      prisma.assetMaintenancePrediction.findFirst.mockResolvedValue(null as any);
      prisma.assetMaintenancePrediction.upsert.mockResolvedValue({} as any);

      const result = await service.predictAssetHealth(TEST_ORG_ID, 'asset-002');

      expect(result.healthScore).toBeLessThan(0.4);
      expect(result.riskScore).toBeGreaterThan(0.6);
      expect(result.recommendedAction).not.toContain('No immediate action');
    });

    it('should throw NotFoundException when asset not found', async () => {
      prisma.asset.findFirst.mockResolvedValue(null as any);

      await expect(service.predictAssetHealth(TEST_ORG_ID, 'nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should handle fully depreciated assets', async () => {
      const tenYearsAgo = new Date();
      tenYearsAgo.setFullYear(tenYearsAgo.getFullYear() - 10);

      prisma.asset.findFirst.mockResolvedValue({
        id: 'asset-003',
        name: 'Ancient Printer',
        purchaseDate: tenYearsAgo,
        purchasePrice: mockDecimal(5000),
        accumulatedDepreciation: mockDecimal(5000),
        currentBookValue: mockDecimal(0),
        salvageValue: mockDecimal(0),
        usefulLifeYears: 5,
        status: 'FULLY_DEPRECIATED',
        organizationId: TEST_ORG_ID,
      } as any);

      prisma.depreciationSchedule.findMany.mockResolvedValue([] as any);
      prisma.assetMaintenancePrediction.findFirst.mockResolvedValue(null as any);
      prisma.assetMaintenancePrediction.upsert.mockResolvedValue({} as any);

      const result = await service.predictAssetHealth(TEST_ORG_ID, 'asset-003');

      expect(result.healthScore).toBeLessThanOrEqual(0.2);
      expect(result.riskScore).toBeGreaterThanOrEqual(0.8);
      const fullyDepFactor = result.factors.find((f) => f.name === 'Fully Depreciated');
      expect(fullyDepFactor).toBeDefined();
    });

    it('should include Age Ratio and Depreciation Ratio factors', async () => {
      prisma.asset.findFirst.mockResolvedValue({
        id: 'asset-004',
        name: 'Medium Asset',
        purchaseDate: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000 * 2), // 2 years
        purchasePrice: mockDecimal(8000),
        accumulatedDepreciation: mockDecimal(3200),
        currentBookValue: mockDecimal(4800),
        salvageValue: mockDecimal(500),
        usefulLifeYears: 5,
        status: 'ACTIVE',
        organizationId: TEST_ORG_ID,
      } as any);

      prisma.depreciationSchedule.findMany.mockResolvedValue([] as any);
      prisma.assetMaintenancePrediction.findFirst.mockResolvedValue(null as any);
      prisma.assetMaintenancePrediction.upsert.mockResolvedValue({} as any);

      const result = await service.predictAssetHealth(TEST_ORG_ID, 'asset-004');

      const factorNames = result.factors.map((f) => f.name);
      expect(factorNames).toContain('Age Ratio');
      expect(factorNames).toContain('Depreciation Ratio');
      expect(factorNames).toContain('Book Value Ratio');
    });

    it('should store prediction in database', async () => {
      prisma.asset.findFirst.mockResolvedValue({
        id: 'asset-005',
        name: 'Test Asset',
        purchaseDate: new Date(),
        purchasePrice: mockDecimal(1000),
        accumulatedDepreciation: mockDecimal(0),
        currentBookValue: mockDecimal(1000),
        salvageValue: mockDecimal(100),
        usefulLifeYears: 3,
        status: 'ACTIVE',
        organizationId: TEST_ORG_ID,
      } as any);

      prisma.depreciationSchedule.findMany.mockResolvedValue([] as any);
      prisma.assetMaintenancePrediction.findFirst.mockResolvedValue(null as any);
      prisma.assetMaintenancePrediction.upsert.mockResolvedValue({} as any);

      await service.predictAssetHealth(TEST_ORG_ID, 'asset-005');

      expect(prisma.assetMaintenancePrediction.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
            healthScore: expect.anything(),
            riskScore: expect.anything(),
          }),
        }),
      );
    });

    it('should use depreciation schedule for failure prediction when available', async () => {
      const twoYearsAgo = new Date();
      twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);

      prisma.asset.findFirst.mockResolvedValue({
        id: 'asset-006',
        name: 'Depreciated Asset',
        purchaseDate: twoYearsAgo,
        purchasePrice: mockDecimal(10000),
        accumulatedDepreciation: mockDecimal(5000),
        currentBookValue: mockDecimal(5000),
        salvageValue: mockDecimal(1000),
        usefulLifeYears: 4,
        status: 'ACTIVE',
        organizationId: TEST_ORG_ID,
      } as any);

      // 24 months of depreciation schedule
      const schedule = Array.from({ length: 24 }, (_, i) => ({
        year: 2024 - Math.floor(i / 12),
        month: (i % 12) + 1,
        bookValue: mockDecimal(10000 - i * 400),
      }));

      prisma.depreciationSchedule.findMany.mockResolvedValue(schedule as any);
      prisma.assetMaintenancePrediction.findFirst.mockResolvedValue(null as any);
      prisma.assetMaintenancePrediction.upsert.mockResolvedValue({} as any);

      const result = await service.predictAssetHealth(TEST_ORG_ID, 'asset-006');

      expect(result.healthScore).toBeGreaterThan(0);
      expect(result.healthScore).toBeLessThan(1);
    });
  });

  describe('getMaintenanceSchedule', () => {
    it('should return assets with riskScore >= 0.5 sorted by risk', async () => {
      prisma.assetMaintenancePrediction.findMany.mockResolvedValue([
        {
          assetId: 'asset-high',
          riskScore: mockDecimal(0.8),
          healthScore: mockDecimal(0.2),
          predictedFailureDate: new Date(2025, 0, 1),
          recommendedAction: 'Replace soon',
          calculatedAt: new Date(),
          asset: { name: 'Old Server', assetNumber: 'AST-001' },
        },
        {
          assetId: 'asset-med',
          riskScore: mockDecimal(0.55),
          healthScore: mockDecimal(0.45),
          predictedFailureDate: null,
          recommendedAction: 'Monitor',
          calculatedAt: new Date(),
          asset: { name: 'Aging Printer', assetNumber: 'AST-002' },
        },
      ] as any);

      const schedule = await service.getMaintenanceSchedule(TEST_ORG_ID);

      expect(schedule).toHaveLength(2);
      expect(schedule[0].assetName).toBe('Old Server');
      expect(schedule[0].riskScore).toBe(0.8);
      expect(schedule[1].assetName).toBe('Aging Printer');
    });

    it('should return empty array when no assets need maintenance', async () => {
      prisma.assetMaintenancePrediction.findMany.mockResolvedValue([] as any);

      const schedule = await service.getMaintenanceSchedule(TEST_ORG_ID);

      expect(schedule).toEqual([]);
    });
  });

  describe('getHealthScores', () => {
    it('should return health scores for all active assets', async () => {
      prisma.asset.findMany.mockResolvedValue([
        {
          id: 'asset-new',
          name: 'New Asset',
          assetNumber: 'AST-NEW',
          purchaseDate: new Date(),
          purchasePrice: mockDecimal(5000),
          accumulatedDepreciation: mockDecimal(0),
          usefulLifeYears: 5,
          status: 'ACTIVE',
        },
        {
          id: 'asset-old',
          name: 'Old Asset',
          assetNumber: 'AST-OLD',
          purchaseDate: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000 * 4),
          purchasePrice: mockDecimal(5000),
          accumulatedDepreciation: mockDecimal(4000),
          usefulLifeYears: 5,
          status: 'ACTIVE',
        },
      ] as any);

      const scores = await service.getHealthScores(TEST_ORG_ID);

      expect(scores).toHaveLength(2);

      const newAsset = scores.find((s) => s.assetId === 'asset-new');
      const oldAsset = scores.find((s) => s.assetId === 'asset-old');

      expect(newAsset!.healthScore).toBeGreaterThan(oldAsset!.healthScore);
    });

    it('should return empty array when no active assets', async () => {
      prisma.asset.findMany.mockResolvedValue([] as any);

      const scores = await service.getHealthScores(TEST_ORG_ID);

      expect(scores).toEqual([]);
    });

    it('should calculate age in months correctly', async () => {
      const exactlyOneYearAgo = new Date();
      exactlyOneYearAgo.setFullYear(exactlyOneYearAgo.getFullYear() - 1);

      prisma.asset.findMany.mockResolvedValue([
        {
          id: 'asset-1yr',
          name: 'One Year Old',
          assetNumber: 'AST-1YR',
          purchaseDate: exactlyOneYearAgo,
          purchasePrice: mockDecimal(10000),
          accumulatedDepreciation: mockDecimal(2000),
          usefulLifeYears: 5,
          status: 'ACTIVE',
        },
      ] as any);

      const scores = await service.getHealthScores(TEST_ORG_ID);

      expect(scores[0].ageMonths).toBeCloseTo(12, 0);
      expect(scores[0].usefulLifeMonths).toBe(60);
    });

    it('should clamp health score between 0 and 1', async () => {
      prisma.asset.findMany.mockResolvedValue([
        {
          id: 'asset-extreme',
          name: 'Extreme',
          assetNumber: 'AST-EXT',
          purchaseDate: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000 * 20),
          purchasePrice: mockDecimal(100),
          accumulatedDepreciation: mockDecimal(100),
          usefulLifeYears: 1,
          status: 'ACTIVE',
        },
      ] as any);

      const scores = await service.getHealthScores(TEST_ORG_ID);

      expect(scores[0].healthScore).toBeGreaterThanOrEqual(0);
      expect(scores[0].healthScore).toBeLessThanOrEqual(1);
    });
  });

  describe('predictAll', () => {
    it('should batch predict and return counts', async () => {
      prisma.asset.findMany.mockResolvedValue([{ id: 'asset-1' }, { id: 'asset-2' }] as any);

      const spy = jest.spyOn(service, 'predictAssetHealth');
      spy.mockResolvedValueOnce({ riskScore: 0.8 } as any); // critical
      spy.mockResolvedValueOnce({ riskScore: 0.2 } as any); // healthy

      const result = await service.predictAll(TEST_ORG_ID);

      expect(result.processed).toBe(2);
      expect(result.critical).toBe(1);
      expect(result.healthy).toBe(1);

      spy.mockRestore();
    });

    it('should handle errors gracefully', async () => {
      prisma.asset.findMany.mockResolvedValue([{ id: 'asset-bad' }] as any);

      const spy = jest.spyOn(service, 'predictAssetHealth');
      spy.mockRejectedValueOnce(new Error('Failed'));

      const result = await service.predictAll(TEST_ORG_ID);

      expect(result.processed).toBe(0);

      spy.mockRestore();
    });

    it('should return all zeros when no assets', async () => {
      prisma.asset.findMany.mockResolvedValue([] as any);

      const result = await service.predictAll(TEST_ORG_ID);

      expect(result.processed).toBe(0);
      expect(result.critical).toBe(0);
      expect(result.warning).toBe(0);
      expect(result.healthy).toBe(0);
    });
  });
});
