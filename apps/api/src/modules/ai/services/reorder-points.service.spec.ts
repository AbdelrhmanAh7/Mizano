import { Test, TestingModule } from '@nestjs/testing';
import { ReorderPointsService } from './reorder-points.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { OllamaInferenceGateway } from './ollama-inference-gateway.service';
import {
  createMockPrisma,
  MockPrismaClient,
  TEST_ORG_ID,
  mockDecimal,
} from '../__tests__/fixtures/ai-test-helpers';

describe('ReorderPointsService', () => {
  let service: ReorderPointsService;
  let prisma: MockPrismaClient;

  beforeEach(async () => {
    prisma = createMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReorderPointsService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: OllamaInferenceGateway,
          useValue: {
            generateCompletion: jest.fn().mockResolvedValue(''),
            generateStructuredOutput: jest.fn().mockResolvedValue({}),
            isAvailable: jest.fn().mockResolvedValue(false),
          },
        },
      ],
    }).compile();

    service = module.get<ReorderPointsService>(ReorderPointsService);
  });

  describe('calculateReorderPoint', () => {
    it('should return zero values for empty sales history', () => {
      const result = service.calculateReorderPoint([], 7, 0.95);

      expect(result.avgDailyDemand).toBe(0);
      expect(result.demandStdDev).toBe(0);
      expect(result.safetyStock).toBe(0);
      expect(result.reorderPoint).toBe(0);
    });

    it('should calculate correct reorder point for constant demand', () => {
      // Constant demand of 10 per day, lead time 7 days
      const dailySales = Array(30).fill(10);
      const result = service.calculateReorderPoint(dailySales, 7, 0.95);

      expect(result.avgDailyDemand).toBe(10);
      expect(result.demandStdDev).toBe(0);
      // ROP = avg * leadTime + safetyStock = 10 * 7 + 0 = 70
      expect(result.reorderPoint).toBe(70);
    });

    it('should increase safety stock with higher service level', () => {
      const dailySales = [5, 10, 8, 12, 7, 15, 3, 9, 11, 6, 10, 14, 8, 7, 13];

      const result95 = service.calculateReorderPoint(dailySales, 7, 0.95);
      const result99 = service.calculateReorderPoint(dailySales, 7, 0.99);

      expect(result99.safetyStock).toBeGreaterThan(result95.safetyStock);
      expect(result99.reorderPoint).toBeGreaterThan(result95.reorderPoint);
    });

    it('should increase reorder point with longer lead time', () => {
      const dailySales = [5, 10, 8, 12, 7, 15, 3, 9, 11, 6, 10, 14, 8, 7, 13];

      const result7 = service.calculateReorderPoint(dailySales, 7, 0.95);
      const result14 = service.calculateReorderPoint(dailySales, 14, 0.95);

      expect(result14.reorderPoint).toBeGreaterThan(result7.reorderPoint);
    });
  });

  describe('calculateEOQ', () => {
    it('should calculate correct EOQ with known values', () => {
      // EOQ = sqrt((2 * 1000 * 50) / 5) = sqrt(20000) = ~142
      const result = service.calculateEOQ(1000, 50, 5);
      expect(result).toBe(Math.ceil(Math.sqrt((2 * 1000 * 50) / 5)));
    });

    it('should return 0 when annual demand is 0', () => {
      const result = service.calculateEOQ(0, 50, 5);
      expect(result).toBe(0);
    });

    it('should return 0 when holding cost is 0', () => {
      const result = service.calculateEOQ(1000, 50, 0);
      expect(result).toBe(0);
    });

    it('should return 0 when annual demand is negative', () => {
      const result = service.calculateEOQ(-100, 50, 5);
      expect(result).toBe(0);
    });

    it('should increase EOQ with higher demand', () => {
      const eoq1000 = service.calculateEOQ(1000, 50, 5);
      const eoq5000 = service.calculateEOQ(5000, 50, 5);
      expect(eoq5000).toBeGreaterThan(eoq1000);
    });
  });

  describe('calculateForItem', () => {
    it('should return zero values for non-GOODS items', async () => {
      prisma.item.findFirst.mockResolvedValue({
        currentStock: 100,
        costPrice: mockDecimal(10),
        type: 'SERVICE',
      } as any);

      const result = await service.calculateForItem(TEST_ORG_ID, 'item-001');

      expect(result.avgDailyDemand).toBe(0);
      expect(result.needsReorder).toBe(false);
      expect(result.status).toBe('OK');
    });

    it('should return zero values when item not found', async () => {
      prisma.item.findFirst.mockResolvedValue(null as any);

      const result = await service.calculateForItem(TEST_ORG_ID, 'nonexistent');

      expect(result.avgDailyDemand).toBe(0);
      expect(result.needsReorder).toBe(false);
    });

    it('should calculate reorder for a GOODS item with sales history', async () => {
      prisma.item.findFirst.mockResolvedValue({
        currentStock: 5,
        costPrice: mockDecimal(10),
        type: 'GOODS',
      } as any);

      // Simulate daily movements
      const movements = Array.from({ length: 30 }, (_, i) => ({
        quantity: mockDecimal(3),
        createdAt: new Date(Date.now() - i * 86400000),
      }));
      prisma.inventoryMovement.findMany.mockResolvedValue(movements as any);

      const result = await service.calculateForItem(TEST_ORG_ID, 'item-001');

      expect(result.avgDailyDemand).toBeGreaterThan(0);
      expect(result.reorderPoint).toBeGreaterThan(0);
      expect(result.needsReorder).toBe(true); // Stock 5 should be below reorder point
    });

    it('should determine DEAD_STOCK when no demand but stock exists', async () => {
      prisma.item.findFirst.mockResolvedValue({
        currentStock: 100,
        costPrice: mockDecimal(10),
        type: 'GOODS',
      } as any);

      prisma.inventoryMovement.findMany.mockResolvedValue([] as any);

      const result = await service.calculateForItem(TEST_ORG_ID, 'item-001');

      expect(result.avgDailyDemand).toBe(0);
      expect(result.status).toBe('DEAD_STOCK');
    });
  });

  describe('calculateForAllItems', () => {
    it('should process all GOODS items in an organization', async () => {
      prisma.item.findMany.mockResolvedValue([
        { id: 'item-1', currentStock: 50, costPrice: mockDecimal(10), type: 'GOODS' },
        { id: 'item-2', currentStock: 30, costPrice: mockDecimal(20), type: 'GOODS' },
      ] as any);

      prisma.inventoryMovement.findMany.mockResolvedValue([] as any);

      const result = await service.calculateForAllItems(TEST_ORG_ID);

      expect(result.calculated).toBe(2);
      expect(result.failed).toBe(0);
      expect(result.items).toHaveLength(2);
    });

    it('should return empty when no items exist', async () => {
      prisma.item.findMany.mockResolvedValue([] as any);

      const result = await service.calculateForAllItems(TEST_ORG_ID);

      expect(result.calculated).toBe(0);
      expect(result.items).toHaveLength(0);
    });
  });

  describe('getReorderAlerts', () => {
    it('should return alerts for items needing reorder', async () => {
      prisma.item.findMany.mockResolvedValue([
        {
          id: 'item-low',
          name: 'Low Item',
          sku: 'SKU-001',
          currentStock: 2,
          reorderPoint: 10,
          costPrice: mockDecimal(5),
          type: 'GOODS',
          reorderAnalysis: null,
        },
      ] as any);

      // Mock movement data that creates demand
      const movements = Array.from({ length: 20 }, (_, i) => ({
        itemId: 'item-low',
        quantity: mockDecimal(5),
        createdAt: new Date(Date.now() - i * 86400000),
      }));
      prisma.inventoryMovement.findMany.mockResolvedValue(movements as any);

      const alerts = await service.getReorderAlerts(TEST_ORG_ID);

      expect(alerts.length).toBeGreaterThan(0);
      expect(alerts[0].itemId).toBe('item-low');
      expect(alerts[0].currentStock).toBe(2);
    });

    it('should return empty alerts when all items are adequately stocked', async () => {
      prisma.item.findMany.mockResolvedValue([
        {
          id: 'item-ok',
          name: 'OK Item',
          sku: 'SKU-002',
          currentStock: 1000,
          reorderPoint: 10,
          costPrice: mockDecimal(5),
          type: 'GOODS',
          reorderAnalysis: null,
        },
      ] as any);

      prisma.inventoryMovement.findMany.mockResolvedValue([] as any);

      const alerts = await service.getReorderAlerts(TEST_ORG_ID);

      // DEAD_STOCK items (no demand) may or may not be flagged as needing reorder
      // The key is there's no LOW_STOCK or CRITICAL alerts
      const urgentAlerts = alerts.filter(
        (a) => a.status === 'LOW_STOCK' || a.status === 'CRITICAL',
      );
      expect(urgentAlerts).toHaveLength(0);
    });
  });

  describe('detectDeadStock', () => {
    it('should detect items with no sales above threshold days', async () => {
      prisma.item.findMany.mockResolvedValue([
        {
          id: 'dead-item',
          name: 'Dead Item',
          sku: 'SKU-DEAD',
          currentStock: 50,
          costPrice: mockDecimal(10),
        },
      ] as any);

      // No movements at all
      prisma.inventoryMovement.findMany.mockResolvedValue([] as any);

      const result = await service.detectDeadStock(TEST_ORG_ID, 90);

      expect(result.length).toBe(1);
      expect(result[0].itemId).toBe('dead-item');
      expect(result[0].stockValue).toBe(500); // 50 * 10
      expect(result[0].suggestedDiscount).toBeGreaterThan(0);
    });

    it('should return empty array when no items have stock', async () => {
      prisma.item.findMany.mockResolvedValue([] as any);

      const result = await service.detectDeadStock(TEST_ORG_ID);

      expect(result).toEqual([]);
    });

    it('should not flag items with recent sales as dead stock', async () => {
      prisma.item.findMany.mockResolvedValue([
        {
          id: 'active-item',
          name: 'Active',
          sku: 'SKU-ACT',
          currentStock: 20,
          costPrice: mockDecimal(10),
        },
      ] as any);

      // Recent sale (yesterday)
      prisma.inventoryMovement.findMany.mockResolvedValue([
        { itemId: 'active-item', createdAt: new Date(Date.now() - 86400000) },
      ] as any);

      const result = await service.detectDeadStock(TEST_ORG_ID, 90);

      expect(result).toHaveLength(0);
    });
  });

  describe('performAbcAnalysis', () => {
    it('should return empty dashboard when no items exist', async () => {
      prisma.item.findMany.mockResolvedValue([] as any);

      const result = await service.performAbcAnalysis(TEST_ORG_ID);

      expect(result.totalItems).toBe(0);
      expect(result.totalAnnualValue).toBe(0);
      expect(result.classifications).toEqual([]);
    });

    it('should classify items into A, B, C categories', async () => {
      // ABC thresholds: A <= 80% cumulative, B <= 95%, C > 95%.
      // Need enough items so the top item(s) fit within the 80% band.
      // item-a: 50 * 365 * 50 = 912,500 (60.8%)  -> A
      // item-b: 20 * 365 * 20 = 146,000 (70.6% cumulative from item-a value, ~10% itself -> cumulative 70.5%) -> let me recalc
      // Actually: item-a value = 50 * 365 * 50 = 912500, item-b = 20 * 365 * 20 = 146000, item-c = 5 * 365 * 5 = 9125, item-d = 1 * 365 * 1 = 365
      // total = 1,067,990. item-a cumul = 85.4% -> B. Still not A.
      // Use: item-a: annualVal = 70 units/day * $10 = $255,500/yr
      //       item-b: 30 units/day * $10 = $109,500/yr
      //       item-c: 5 units/day * $5 = $9,125/yr
      //       item-d: 1 unit/day * $1 = $365/yr
      // total = 374,490. item-a = 68.2% -> A, item-b cumul = 97.4% -> C (too high)
      // Better approach: 5 items with more gradual distribution
      prisma.item.findMany.mockResolvedValue([
        {
          id: 'item-a',
          name: 'High',
          sku: 'A',
          costPrice: mockDecimal(10),
          reorderAnalysis: { avgDailyDemand: mockDecimal(40) },
        },
        {
          id: 'item-b',
          name: 'MedHigh',
          sku: 'B',
          costPrice: mockDecimal(10),
          reorderAnalysis: { avgDailyDemand: mockDecimal(30) },
        },
        {
          id: 'item-c',
          name: 'Med',
          sku: 'C',
          costPrice: mockDecimal(10),
          reorderAnalysis: { avgDailyDemand: mockDecimal(20) },
        },
        {
          id: 'item-d',
          name: 'MedLow',
          sku: 'D',
          costPrice: mockDecimal(10),
          reorderAnalysis: { avgDailyDemand: mockDecimal(8) },
        },
        {
          id: 'item-e',
          name: 'Low',
          sku: 'E',
          costPrice: mockDecimal(10),
          reorderAnalysis: { avgDailyDemand: mockDecimal(2) },
        },
      ] as any);
      // Annual values: a=146000, b=109500, c=73000, d=29200, e=7300. Total=365000
      // Cumulative: a=40% -> A, b=70% -> A, c=90% -> B, d=98% -> C, e=100% -> C

      const result = await service.performAbcAnalysis(TEST_ORG_ID);

      expect(result.totalItems).toBe(5);
      expect(result.totalAnnualValue).toBeGreaterThan(0);
      // Highest value item should be in category A
      expect(result.classifications[0].category).toBe('A');
      // Summary should have correct service levels
      expect(result.summary.A.serviceLevel).toBe(0.98);
      expect(result.summary.B.serviceLevel).toBe(0.95);
      expect(result.summary.C.serviceLevel).toBe(0.9);
    });
  });
});
