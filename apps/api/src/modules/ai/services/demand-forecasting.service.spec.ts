import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { DemandForecastingService } from './demand-forecasting.service';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  createMockPrisma,
  MockPrismaClient,
  TEST_ORG_ID,
  mockDecimal,
} from '../__tests__/fixtures/ai-test-helpers';

describe('DemandForecastingService', () => {
  let service: DemandForecastingService;
  let prisma: MockPrismaClient;

  const orgId = TEST_ORG_ID;

  function createMockItem(overrides: Record<string, any> = {}) {
    return {
      id: 'item-001',
      organizationId: orgId,
      name: 'Widget A',
      sku: 'WID-001',
      type: 'GOODS',
      isActive: true,
      deletedAt: null,
      currentStock: 100,
      reorderPoint: mockDecimal(20),
      sellingPrice: mockDecimal(29.99),
      ...overrides,
    };
  }

  /**
   * Creates mock inventory movements for a given number of months.
   * Generates enough data to simulate monthly demand history.
   */
  function createMockMovements(months: number, baseQuantity: number = 50) {
    const movements = [];
    const now = new Date();
    for (let i = 0; i < months; i++) {
      const date = new Date(now);
      date.setMonth(date.getMonth() - i);
      // Add some variation
      const quantity = baseQuantity + Math.sin((i * Math.PI) / 6) * 10;
      movements.push({
        id: `mov-${i}`,
        quantity: mockDecimal(Math.abs(quantity)),
        type: 'sale',
        createdAt: date,
      });
    }
    return movements;
  }

  beforeEach(async () => {
    prisma = createMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [DemandForecastingService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<DemandForecastingService>(DemandForecastingService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('forecastItem', () => {
    it('should throw NotFoundException when item does not exist', async () => {
      prisma.item.findFirst.mockResolvedValue(null as any);

      await expect(service.forecastItem(orgId, 'non-existent')).rejects.toThrow(NotFoundException);
    });

    it('should return empty forecast when insufficient data points', async () => {
      prisma.item.findFirst.mockResolvedValue(createMockItem() as any);
      // Return fewer than MIN_DATA_POINTS (6) movements
      prisma.inventoryMovement.findMany.mockResolvedValue([
        { quantity: mockDecimal(10), createdAt: new Date() },
        { quantity: mockDecimal(20), createdAt: new Date() },
      ] as any);

      const result = await service.forecastItem(orgId, 'item-001', 6);

      expect(result.dataPoints).toBe(0);
      expect(result.confidence).toBe('low');
      expect(result.method).toBe('simple-exponential');
      expect(result.forecasts).toHaveLength(6);
      // Empty forecast should have zero predictions
      result.forecasts.forEach((f) => {
        expect(f.predicted).toBe(0);
      });
    });

    it('should return forecast with simple-exponential for moderate data', async () => {
      prisma.item.findFirst.mockResolvedValue(createMockItem() as any);
      // Create 10 months of data (enough for forecast but not for Holt-Winters with season=12)
      const movements = createMockMovements(10);
      prisma.inventoryMovement.findMany.mockResolvedValue(movements as any);
      prisma.itemDemandForecast.deleteMany.mockResolvedValue({ count: 0 } as any);
      prisma.itemDemandForecast.createMany.mockResolvedValue({ count: 6 } as any);

      const result = await service.forecastItem(orgId, 'item-001', 6);

      expect(result.forecasts).toHaveLength(6);
      expect(result.method).toBe('simple-exponential');
      expect(result.confidence).toBe('low');
      expect(result.dataPoints).toBeGreaterThan(0);
    });

    it('should produce forecast dates starting from next month', async () => {
      prisma.item.findFirst.mockResolvedValue(createMockItem() as any);
      const movements = createMockMovements(8);
      prisma.inventoryMovement.findMany.mockResolvedValue(movements as any);
      prisma.itemDemandForecast.deleteMany.mockResolvedValue({ count: 0 } as any);
      prisma.itemDemandForecast.createMany.mockResolvedValue({ count: 6 } as any);

      const result = await service.forecastItem(orgId, 'item-001', 6);

      const now = new Date();
      const nextMonth = now.getMonth() + 1;
      // First forecast date should be next month
      expect(result.forecasts[0].date.getMonth()).toBe(nextMonth % 12);
    });

    it('should include model data in response', async () => {
      prisma.item.findFirst.mockResolvedValue(createMockItem() as any);
      const movements = createMockMovements(8);
      prisma.inventoryMovement.findMany.mockResolvedValue(movements as any);
      prisma.itemDemandForecast.deleteMany.mockResolvedValue({ count: 0 } as any);
      prisma.itemDemandForecast.createMany.mockResolvedValue({ count: 6 } as any);

      const result = await service.forecastItem(orgId, 'item-001', 6);

      expect(result.model).toBeDefined();
      expect(result.model).toHaveProperty('level');
      expect(result.model).toHaveProperty('trend');
      expect(result.model).toHaveProperty('seasonalIndices');
      expect(result.model.seasonalIndices).toHaveLength(12);
    });

    it('should ensure predicted values are non-negative', async () => {
      prisma.item.findFirst.mockResolvedValue(createMockItem() as any);
      const movements = createMockMovements(8);
      prisma.inventoryMovement.findMany.mockResolvedValue(movements as any);
      prisma.itemDemandForecast.deleteMany.mockResolvedValue({ count: 0 } as any);
      prisma.itemDemandForecast.createMany.mockResolvedValue({ count: 6 } as any);

      const result = await service.forecastItem(orgId, 'item-001', 6);

      result.forecasts.forEach((f) => {
        expect(f.predicted).toBeGreaterThanOrEqual(0);
        expect(f.lowerBound).toBeGreaterThanOrEqual(0);
      });
    });
  });

  describe('forecastAllItems', () => {
    it('should process all active GOODS items', async () => {
      prisma.item.findMany.mockResolvedValue([
        createMockItem({ id: 'item-1', name: 'Widget A' }),
        createMockItem({ id: 'item-2', name: 'Widget B' }),
      ] as any);

      // Both items have enough data
      prisma.inventoryMovement.findMany.mockResolvedValue(createMockMovements(8) as any);
      prisma.item.findFirst.mockResolvedValue(createMockItem() as any);
      prisma.itemDemandForecast.deleteMany.mockResolvedValue({ count: 0 } as any);
      prisma.itemDemandForecast.createMany.mockResolvedValue({ count: 6 } as any);

      const result = await service.forecastAllItems(orgId);

      expect(result.processed).toBe(2);
      expect(result.errors).toHaveLength(0);
    });

    it('should skip items with insufficient data', async () => {
      prisma.item.findMany.mockResolvedValue([createMockItem({ id: 'item-1' })] as any);
      // Only 2 data points - below MIN_DATA_POINTS
      prisma.inventoryMovement.findMany.mockResolvedValue([
        { quantity: mockDecimal(10), createdAt: new Date() },
      ] as any);

      const result = await service.forecastAllItems(orgId);

      expect(result.skipped).toBe(1);
      expect(result.processed).toBe(0);
    });

    it('should return zero counts for empty organization', async () => {
      prisma.item.findMany.mockResolvedValue([] as any);

      const result = await service.forecastAllItems(orgId);

      expect(result.processed).toBe(0);
      expect(result.skipped).toBe(0);
      expect(result.errors).toHaveLength(0);
    });

    it('should capture errors for failed forecasts', async () => {
      prisma.item.findMany.mockResolvedValue([
        createMockItem({ id: 'item-fail', name: 'Failing Item' }),
      ] as any);
      prisma.inventoryMovement.findMany.mockResolvedValue(createMockMovements(8) as any);
      prisma.item.findFirst.mockResolvedValue(null as any); // will throw NotFoundException

      const result = await service.forecastAllItems(orgId);

      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('getSeasonalityPattern', () => {
    it('should return stable pattern when insufficient data', async () => {
      // Less than 12 months of data
      prisma.inventoryMovement.findMany.mockResolvedValue(createMockMovements(6) as any);

      const result = await service.getSeasonalityPattern(orgId, 'item-001');

      expect(result.pattern).toBe('stable');
      expect(result.seasonalStrength).toBe(0);
      expect(result.trendStrength).toBe(0);
      expect(result.monthlyIndices).toHaveLength(12);
      expect(result.peakMonths).toHaveLength(0);
      expect(result.lowMonths).toHaveLength(0);
    });

    it('should return monthly indices array of length 12', async () => {
      const movements = createMockMovements(24);
      prisma.inventoryMovement.findMany.mockResolvedValue(movements as any);

      const result = await service.getSeasonalityPattern(orgId, 'item-001');

      expect(result.monthlyIndices).toHaveLength(12);
    });

    it('should identify pattern type from data characteristics', async () => {
      const movements = createMockMovements(24);
      prisma.inventoryMovement.findMany.mockResolvedValue(movements as any);

      const result = await service.getSeasonalityPattern(orgId, 'item-001');

      expect(['seasonal', 'trending', 'stable', 'volatile']).toContain(result.pattern);
    });

    it('should return seasonalStrength between 0 and 1', async () => {
      const movements = createMockMovements(24);
      prisma.inventoryMovement.findMany.mockResolvedValue(movements as any);

      const result = await service.getSeasonalityPattern(orgId, 'item-001');

      expect(result.seasonalStrength).toBeGreaterThanOrEqual(0);
      expect(result.seasonalStrength).toBeLessThanOrEqual(1);
    });
  });

  describe('detectItemTrend', () => {
    it('should return flat trend with zero confidence for insufficient data', async () => {
      prisma.inventoryMovement.findMany.mockResolvedValue([
        { quantity: mockDecimal(10), createdAt: new Date() },
      ] as any);

      const result = await service.detectItemTrend(orgId, 'item-001');

      expect(result.direction).toBe('flat');
      expect(result.magnitude).toBe(0);
      expect(result.confidence).toBe(0);
    });

    it('should detect direction from historical data', async () => {
      const movements = createMockMovements(12, 50);
      prisma.inventoryMovement.findMany.mockResolvedValue(movements as any);

      const result = await service.detectItemTrend(orgId, 'item-001');

      expect(['up', 'down', 'flat']).toContain(result.direction);
      expect(result.confidence).toBeGreaterThanOrEqual(0);
    });
  });

  describe('getForecastDashboard', () => {
    it('should return dashboard with item counts', async () => {
      prisma.item.findMany.mockResolvedValue([
        createMockItem({ id: 'item-1' }),
        createMockItem({ id: 'item-2' }),
        createMockItem({ id: 'item-3' }),
      ] as any);
      prisma.itemDemandForecast.findMany.mockResolvedValue([
        { itemId: 'item-1', confidence: mockDecimal(0.9), trendComponent: mockDecimal(0.5) },
        { itemId: 'item-2', confidence: mockDecimal(0.5), trendComponent: mockDecimal(-0.2) },
      ] as any);
      // For trend detection per item
      prisma.inventoryMovement.findMany.mockResolvedValue([] as any);

      const result = await service.getForecastDashboard(orgId);

      expect(result.totalItems).toBe(3);
      expect(result.itemsWithForecasts).toBe(2);
    });

    it('should count high confidence forecasts', async () => {
      prisma.item.findMany.mockResolvedValue([] as any);
      prisma.itemDemandForecast.findMany.mockResolvedValue([
        { itemId: 'item-1', confidence: mockDecimal(0.9), trendComponent: mockDecimal(0) },
        { itemId: 'item-2', confidence: mockDecimal(0.8), trendComponent: mockDecimal(0) },
        { itemId: 'item-3', confidence: mockDecimal(0.4), trendComponent: mockDecimal(0) },
      ] as any);

      const result = await service.getForecastDashboard(orgId);

      expect(result.highConfidenceCount).toBe(2); // > 0.7
    });

    it('should return empty arrays for growing/declining when no items', async () => {
      prisma.item.findMany.mockResolvedValue([] as any);
      prisma.itemDemandForecast.findMany.mockResolvedValue([] as any);

      const result = await service.getForecastDashboard(orgId);

      expect(result.topGrowingItems).toHaveLength(0);
      expect(result.topDecliningItems).toHaveLength(0);
      expect(result.totalItems).toBe(0);
    });
  });
});
