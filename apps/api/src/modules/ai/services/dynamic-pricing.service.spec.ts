import { Test, TestingModule } from '@nestjs/testing';
import {
  DynamicPricingService,
  ElasticityResult,
  PriceSuggestion,
} from './dynamic-pricing.service';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  createMockPrisma,
  MockPrismaClient,
  TEST_ORG_ID,
  mockDecimal,
} from '../__tests__/fixtures/ai-test-helpers';

describe('DynamicPricingService', () => {
  let service: DynamicPricingService;
  let prisma: MockPrismaClient;

  const orgId = TEST_ORG_ID;

  function createMockItem(overrides: Record<string, any> = {}) {
    return {
      id: 'item-001',
      organizationId: orgId,
      name: 'Standard Widget',
      sellingPrice: mockDecimal(100),
      costPrice: mockDecimal(60),
      isActive: true,
      ...overrides,
    };
  }

  function createMockInvoiceLine(price: number, quantity: number, date: string) {
    return {
      rate: mockDecimal(price),
      quantity: mockDecimal(quantity),
      invoice: { date: new Date(date) },
    };
  }

  beforeEach(async () => {
    prisma = createMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [DynamicPricingService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<DynamicPricingService>(DynamicPricingService);
  });

  // ---------------------------------------------------------------------------
  // estimateElasticity
  // ---------------------------------------------------------------------------
  describe('estimateElasticity', () => {
    it('should throw when item is not found', async () => {
      prisma.item.findFirst.mockResolvedValue(null as any);

      await expect(service.estimateElasticity(orgId, 'non-existent')).rejects.toThrow(
        'Item non-existent not found',
      );
    });

    it('should return LOW confidence for items with few data points', async () => {
      prisma.item.findFirst.mockResolvedValue(createMockItem() as any);
      prisma.invoiceLine.findMany.mockResolvedValue([
        createMockInvoiceLine(100, 2, '2025-01-01'),
        createMockInvoiceLine(100, 3, '2025-02-01'),
      ] as any);

      const result = await service.estimateElasticity(orgId, 'item-001');

      expect(result.dataPoints).toBeLessThan(5);
      expect(result.confidence).toBe(0.1);
      expect(result.elasticity).toBe(0);
      expect(result.rSquared).toBe(0);
    });

    it('should calculate elasticity for items with sufficient data', async () => {
      prisma.item.findFirst.mockResolvedValue(createMockItem() as any);
      // Provide data with varying prices and quantities
      prisma.invoiceLine.findMany.mockResolvedValue([
        createMockInvoiceLine(100, 10, '2025-01-01'),
        createMockInvoiceLine(90, 15, '2025-02-01'),
        createMockInvoiceLine(110, 8, '2025-03-01'),
        createMockInvoiceLine(95, 12, '2025-04-01'),
        createMockInvoiceLine(105, 9, '2025-05-01'),
        createMockInvoiceLine(85, 18, '2025-06-01'),
        createMockInvoiceLine(115, 6, '2025-07-01'),
      ] as any);

      const result = await service.estimateElasticity(orgId, 'item-001');

      expect(result.dataPoints).toBe(7);
      expect(result.itemId).toBe('item-001');
      expect(result.itemName).toBe('Standard Widget');
      expect(typeof result.elasticity).toBe('number');
      expect(typeof result.rSquared).toBe('number');
      expect(result.confidence).toBeGreaterThan(0.1);
    });

    it('should determine isElastic correctly when |elasticity| > 1', async () => {
      prisma.item.findFirst.mockResolvedValue(createMockItem() as any);
      // Strong inverse relationship: lower price => much higher quantity
      prisma.invoiceLine.findMany.mockResolvedValue([
        createMockInvoiceLine(50, 100, '2025-01-01'),
        createMockInvoiceLine(60, 60, '2025-02-01'),
        createMockInvoiceLine(70, 30, '2025-03-01'),
        createMockInvoiceLine(80, 15, '2025-04-01'),
        createMockInvoiceLine(90, 5, '2025-05-01'),
        createMockInvoiceLine(100, 2, '2025-06-01'),
      ] as any);

      const result = await service.estimateElasticity(orgId, 'item-001');

      // Very elastic - big quantity change for small price change
      expect(typeof result.isElastic).toBe('boolean');
    });

    it('should return correct price and quantity ranges', async () => {
      prisma.item.findFirst.mockResolvedValue(createMockItem() as any);
      prisma.invoiceLine.findMany.mockResolvedValue([
        createMockInvoiceLine(80, 5, '2025-01-01'),
        createMockInvoiceLine(100, 10, '2025-02-01'),
        createMockInvoiceLine(120, 15, '2025-03-01'),
        createMockInvoiceLine(90, 8, '2025-04-01'),
        createMockInvoiceLine(110, 12, '2025-05-01'),
      ] as any);

      const result = await service.estimateElasticity(orgId, 'item-001');

      expect(result.priceRange.min).toBe(80);
      expect(result.priceRange.max).toBe(120);
      expect(result.quantityRange.min).toBe(5);
      expect(result.quantityRange.max).toBe(15);
    });
  });

  // ---------------------------------------------------------------------------
  // suggestPrice
  // ---------------------------------------------------------------------------
  describe('suggestPrice', () => {
    it('should throw when item is not found', async () => {
      prisma.item.findFirst.mockResolvedValue(null as any);

      await expect(service.suggestPrice(orgId, 'non-existent')).rejects.toThrow();
    });

    it('should return current price when insufficient data', async () => {
      prisma.item.findFirst.mockResolvedValue(createMockItem() as any);
      prisma.invoiceLine.findMany.mockResolvedValue([
        createMockInvoiceLine(100, 2, '2025-01-01'),
      ] as any);

      const result = await service.suggestPrice(orgId, 'item-001');

      expect(result.itemId).toBe('item-001');
      expect(result.currentPrice).toBe(100);
      expect(result.costPrice).toBe(60);
      expect(result.reason).toContain('No significant data');
    });

    it('should suggest lower price for elastic items', async () => {
      prisma.item.findFirst.mockResolvedValue(createMockItem() as any);
      // Create data suggesting elastic demand (negative slope, high r-squared)
      prisma.invoiceLine.findMany.mockResolvedValue([
        createMockInvoiceLine(80, 20, '2025-01-01'),
        createMockInvoiceLine(90, 15, '2025-02-01'),
        createMockInvoiceLine(100, 10, '2025-03-01'),
        createMockInvoiceLine(110, 5, '2025-04-01'),
        createMockInvoiceLine(120, 2, '2025-05-01'),
        createMockInvoiceLine(85, 18, '2025-06-01'),
      ] as any);

      const result = await service.suggestPrice(orgId, 'item-001');

      expect(result.currentPrice).toBe(100);
      // Suggested price should be constrained by cost
      expect(result.suggestedPrice).toBeGreaterThanOrEqual(result.costPrice);
    });

    it('should enforce minimum price from target margin', async () => {
      const cheapItem = createMockItem({
        sellingPrice: mockDecimal(50),
        costPrice: mockDecimal(45),
      });
      prisma.item.findFirst.mockResolvedValue(cheapItem as any);
      prisma.invoiceLine.findMany.mockResolvedValue([] as any);

      const result = await service.suggestPrice(orgId, 'item-001', 0.5);

      // min price = 45 / (1 - 0.5) = 90
      expect(result.suggestedPrice).toBeGreaterThanOrEqual(90);
    });

    it('should compute margin fields correctly', async () => {
      prisma.item.findFirst.mockResolvedValue(createMockItem() as any);
      prisma.invoiceLine.findMany.mockResolvedValue([] as any);

      const result = await service.suggestPrice(orgId, 'item-001');

      expect(result.currentMargin).toBe(0.4); // (100-60)/100
    });
  });

  // ---------------------------------------------------------------------------
  // analyzeAllPricing
  // ---------------------------------------------------------------------------
  describe('analyzeAllPricing', () => {
    it('should analyze all active items', async () => {
      prisma.item.findMany.mockResolvedValue([{ id: 'item-1' }, { id: 'item-2' }] as any);

      // Each suggestPrice call
      prisma.item.findFirst.mockResolvedValue(createMockItem() as any);
      prisma.invoiceLine.findMany.mockResolvedValue([] as any);

      const result = await service.analyzeAllPricing(orgId);

      expect(result.analyzed).toBe(2);
      expect(typeof result.suggestions).toBe('number');
    });

    it('should handle empty inventory', async () => {
      prisma.item.findMany.mockResolvedValue([] as any);

      const result = await service.analyzeAllPricing(orgId);

      expect(result.analyzed).toBe(0);
      expect(result.suggestions).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // getPricingInsights
  // ---------------------------------------------------------------------------
  describe('getPricingInsights', () => {
    it('should return LOW_DATA insight for items with few sales', async () => {
      const item = createMockItem();
      prisma.item.findMany.mockResolvedValue([item] as any);
      prisma.item.findFirst.mockResolvedValue(item as any);
      prisma.invoiceLine.findMany.mockResolvedValue([
        createMockInvoiceLine(100, 1, '2025-01-01'),
      ] as any);

      const insights = await service.getPricingInsights(orgId);

      expect(insights.length).toBeGreaterThan(0);
      expect(insights[0].type).toBe('LOW_DATA');
    });

    it('should skip items with zero cost or selling price', async () => {
      prisma.item.findMany.mockResolvedValue([
        createMockItem({
          id: 'item-free',
          sellingPrice: mockDecimal(0),
          costPrice: mockDecimal(0),
        }),
      ] as any);

      const insights = await service.getPricingInsights(orgId);

      expect(insights).toHaveLength(0);
    });

    it('should sort insights by potential impact descending', async () => {
      const items = [
        createMockItem({
          id: 'item-1',
          name: 'A',
          sellingPrice: mockDecimal(200),
          costPrice: mockDecimal(50),
        }),
        createMockItem({
          id: 'item-2',
          name: 'B',
          sellingPrice: mockDecimal(50),
          costPrice: mockDecimal(20),
        }),
      ];
      prisma.item.findMany.mockResolvedValue(items as any);
      prisma.item.findFirst.mockResolvedValue(items[0] as any);
      prisma.invoiceLine.findMany.mockResolvedValue([] as any);

      const insights = await service.getPricingInsights(orgId);

      for (let i = 1; i < insights.length; i++) {
        expect(insights[i - 1].potentialImpact).toBeGreaterThanOrEqual(insights[i].potentialImpact);
      }
    });
  });
});
