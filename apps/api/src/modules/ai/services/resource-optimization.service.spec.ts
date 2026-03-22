import { Test, TestingModule } from '@nestjs/testing';
import { ResourceOptimizationService } from './resource-optimization.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { OllamaInferenceGateway } from './ollama-inference-gateway.service';
import {
  createMockPrisma,
  MockPrismaClient,
  TEST_ORG_ID,
  mockDecimal,
} from '../__tests__/fixtures/ai-test-helpers';

describe('ResourceOptimizationService', () => {
  let service: ResourceOptimizationService;
  let prisma: MockPrismaClient;

  beforeEach(async () => {
    prisma = createMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ResourceOptimizationService,
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

    service = module.get<ResourceOptimizationService>(ResourceOptimizationService);
  });

  describe('getResourceTrends', () => {
    it('should identify increasing expense trend in a category', async () => {
      // 6 months of increasing expenses
      const expenses = Array.from({ length: 6 }, (_, i) => ({
        id: `exp-${i}`,
        date: new Date(2024, i, 15),
        amount: mockDecimal(1000 + i * 500), // growing: 1000, 1500, 2000, 2500, 3000, 3500
        account: { name: 'Cloud Services' },
        deletedAt: null,
      }));

      prisma.expense.findMany.mockResolvedValue(expenses as any);

      const result = await service.getResourceTrends(TEST_ORG_ID, 12);

      expect(result.categories.length).toBeGreaterThan(0);
      const cloudTrend = result.categories.find((c) => c.category === 'Cloud Services');
      expect(cloudTrend).toBeDefined();
      expect(cloudTrend!.trendDirection).toBe('increasing');
      expect(cloudTrend!.trend.slope).toBeGreaterThan(0);
    });

    it('should identify stable expense trend', async () => {
      const expenses = Array.from({ length: 6 }, (_, i) => ({
        id: `exp-${i}`,
        date: new Date(2024, i, 15),
        amount: mockDecimal(1000), // constant 1000 each month
        account: { name: 'Rent' },
        deletedAt: null,
      }));

      prisma.expense.findMany.mockResolvedValue(expenses as any);

      const result = await service.getResourceTrends(TEST_ORG_ID);

      const rentTrend = result.categories.find((c) => c.category === 'Rent');
      expect(rentTrend).toBeDefined();
      expect(rentTrend!.trendDirection).toBe('stable');
    });

    it('should identify decreasing expense trend', async () => {
      const expenses = Array.from({ length: 6 }, (_, i) => ({
        id: `exp-${i}`,
        date: new Date(2024, i, 15),
        amount: mockDecimal(5000 - i * 800), // decreasing
        account: { name: 'Marketing' },
        deletedAt: null,
      }));

      prisma.expense.findMany.mockResolvedValue(expenses as any);

      const result = await service.getResourceTrends(TEST_ORG_ID);

      const marketingTrend = result.categories.find((c) => c.category === 'Marketing');
      expect(marketingTrend).toBeDefined();
      expect(marketingTrend!.trendDirection).toBe('decreasing');
      expect(marketingTrend!.trend.slope).toBeLessThan(0);
    });

    it('should return empty categories when no expenses exist', async () => {
      prisma.expense.findMany.mockResolvedValue([] as any);

      const result = await service.getResourceTrends(TEST_ORG_ID);

      expect(result.categories).toEqual([]);
    });

    it('should skip categories with fewer than 2 months of data', async () => {
      prisma.expense.findMany.mockResolvedValue([
        {
          id: 'exp-1',
          date: new Date(2024, 0, 15),
          amount: mockDecimal(500),
          account: { name: 'One-Off' },
          deletedAt: null,
        },
      ] as any);

      const result = await service.getResourceTrends(TEST_ORG_ID);

      expect(result.categories).toEqual([]);
    });

    it('should include R-squared in trend data', async () => {
      const expenses = Array.from({ length: 4 }, (_, i) => ({
        id: `exp-${i}`,
        date: new Date(2024, i, 15),
        amount: mockDecimal(1000 + i * 100),
        account: { name: 'Linear Expense' },
        deletedAt: null,
      }));

      prisma.expense.findMany.mockResolvedValue(expenses as any);

      const result = await service.getResourceTrends(TEST_ORG_ID);

      expect(result.categories[0].trend.rSquared).toBeGreaterThanOrEqual(0);
      expect(result.categories[0].trend.rSquared).toBeLessThanOrEqual(1);
    });
  });

  describe('forecastResources', () => {
    it('should return historical data and forecast points', async () => {
      const expenses = Array.from({ length: 12 }, (_, i) => ({
        id: `exp-${i}`,
        date: new Date(2024, i, 15),
        amount: mockDecimal(1000 + i * 50),
        deletedAt: null,
      }));

      prisma.expense.findMany.mockResolvedValue(expenses as any);

      const result = await service.forecastResources(TEST_ORG_ID, 6);

      expect(result.historical.length).toBe(12);
      expect(result.forecast.length).toBe(6);

      for (const point of result.forecast) {
        expect(point.month).toBeDefined();
        expect(point.amount).toBeGreaterThanOrEqual(0);
        expect(point.confidence).toBeGreaterThan(0);
        expect(point.confidence).toBeLessThanOrEqual(1);
      }
    });

    it('should return empty forecast when insufficient data', async () => {
      prisma.expense.findMany.mockResolvedValue([
        { id: 'e1', date: new Date(2024, 0, 15), amount: mockDecimal(1000), deletedAt: null },
      ] as any);

      const result = await service.forecastResources(TEST_ORG_ID, 6);

      expect(result.historical.length).toBe(1);
      expect(result.forecast).toEqual([]);
    });

    it('should decrease confidence for farther forecast months', async () => {
      const expenses = Array.from({ length: 6 }, (_, i) => ({
        id: `exp-${i}`,
        date: new Date(2024, i, 15),
        amount: mockDecimal(1000),
        deletedAt: null,
      }));

      prisma.expense.findMany.mockResolvedValue(expenses as any);

      const result = await service.forecastResources(TEST_ORG_ID, 6);

      if (result.forecast.length >= 2) {
        expect(result.forecast[0].confidence).toBeGreaterThanOrEqual(
          result.forecast[result.forecast.length - 1].confidence,
        );
      }
    });

    it('should handle all-zero expenses without crashing', async () => {
      const expenses = Array.from({ length: 4 }, (_, i) => ({
        id: `exp-${i}`,
        date: new Date(2024, i, 15),
        amount: mockDecimal(0),
        deletedAt: null,
      }));

      prisma.expense.findMany.mockResolvedValue(expenses as any);

      const result = await service.forecastResources(TEST_ORG_ID, 3);

      expect(result.historical.length).toBe(4);
      // Forecast should not crash with zero values
      expect(result.forecast.length).toBe(3);
    });
  });

  describe('getOptimizationOpportunities', () => {
    it('should identify a spending spike', async () => {
      // Need z-score > 2 for spike detection. With 4 months at 1000 and 1 at 10000:
      // mean=2800, stdDev≈4024 → z=(10000-2800)/4024≈1.79 still too low.
      // Better: use more baseline months so stdDev is smaller relative to spike.
      const expenses = [
        {
          id: 'e1',
          date: new Date(2024, 0, 15),
          amount: mockDecimal(1000),
          account: { name: 'IT' },
          deletedAt: null,
        },
        {
          id: 'e2',
          date: new Date(2024, 1, 15),
          amount: mockDecimal(1000),
          account: { name: 'IT' },
          deletedAt: null,
        },
        {
          id: 'e3',
          date: new Date(2024, 2, 15),
          amount: mockDecimal(1000),
          account: { name: 'IT' },
          deletedAt: null,
        },
        {
          id: 'e4',
          date: new Date(2024, 3, 15),
          amount: mockDecimal(1000),
          account: { name: 'IT' },
          deletedAt: null,
        },
        {
          id: 'e5',
          date: new Date(2024, 4, 15),
          amount: mockDecimal(1000),
          account: { name: 'IT' },
          deletedAt: null,
        },
        {
          id: 'e6',
          date: new Date(2024, 5, 15),
          amount: mockDecimal(1000),
          account: { name: 'IT' },
          deletedAt: null,
        },
        {
          id: 'e7',
          date: new Date(2024, 6, 15),
          amount: mockDecimal(10000),
          account: { name: 'IT' },
          deletedAt: null,
        }, // spike
      ];

      prisma.expense.findMany.mockResolvedValue(expenses as any);
      prisma.invoice.findMany.mockResolvedValue([] as any);

      const result = await service.getOptimizationOpportunities(TEST_ORG_ID);

      const spikes = result.opportunities.filter((o) => o.type === 'spike');
      expect(spikes.length).toBeGreaterThan(0);
      expect(spikes[0].category).toBe('IT');
      expect(spikes[0].potentialSavings).toBeGreaterThan(0);
    });

    it('should identify growing cost categories', async () => {
      const expenses = Array.from({ length: 5 }, (_, i) => ({
        id: `exp-${i}`,
        date: new Date(2024, i, 15),
        amount: mockDecimal(1000 + i * 500), // 1000, 1500, 2000, 2500, 3000
        account: { name: 'Cloud' },
        deletedAt: null,
      }));

      prisma.expense.findMany.mockResolvedValue(expenses as any);
      prisma.invoice.findMany.mockResolvedValue([] as any);

      const result = await service.getOptimizationOpportunities(TEST_ORG_ID);

      const growing = result.opportunities.filter((o) => o.type === 'growing_cost');
      expect(growing.length).toBeGreaterThan(0);
    });

    it('should flag high expense-to-revenue ratio', async () => {
      prisma.expense.findMany.mockResolvedValue([
        {
          id: 'e1',
          date: new Date(2024, 0, 15),
          amount: mockDecimal(5000),
          account: { name: 'Salaries' },
          deletedAt: null,
        },
        {
          id: 'e2',
          date: new Date(2024, 1, 15),
          amount: mockDecimal(5000),
          account: { name: 'Salaries' },
          deletedAt: null,
        },
        {
          id: 'e3',
          date: new Date(2024, 2, 15),
          amount: mockDecimal(5000),
          account: { name: 'Salaries' },
          deletedAt: null,
        },
      ] as any);

      prisma.invoice.findMany.mockResolvedValue([
        { grandTotal: mockDecimal(20000) }, // Revenue = 20000, expense = 15000 → 75% ratio
      ] as any);

      const result = await service.getOptimizationOpportunities(TEST_ORG_ID);

      const highRatio = result.opportunities.filter((o) => o.type === 'high_ratio');
      expect(highRatio.length).toBeGreaterThan(0);
    });

    it('should return empty opportunities when no issues found', async () => {
      prisma.expense.findMany.mockResolvedValue([] as any);
      prisma.invoice.findMany.mockResolvedValue([] as any);

      const result = await service.getOptimizationOpportunities(TEST_ORG_ID);

      expect(result.opportunities).toEqual([]);
    });

    it('should sort opportunities by potential savings descending', async () => {
      const expenses = [
        {
          id: 'e1',
          date: new Date(2024, 0, 15),
          amount: mockDecimal(500),
          account: { name: 'Small' },
          deletedAt: null,
        },
        {
          id: 'e2',
          date: new Date(2024, 1, 15),
          amount: mockDecimal(500),
          account: { name: 'Small' },
          deletedAt: null,
        },
        {
          id: 'e3',
          date: new Date(2024, 2, 15),
          amount: mockDecimal(500),
          account: { name: 'Small' },
          deletedAt: null,
        },
        {
          id: 'e4',
          date: new Date(2024, 3, 15),
          amount: mockDecimal(8000),
          account: { name: 'Small' },
          deletedAt: null,
        },
        {
          id: 'e5',
          date: new Date(2024, 0, 15),
          amount: mockDecimal(2000),
          account: { name: 'Big' },
          deletedAt: null,
        },
        {
          id: 'e6',
          date: new Date(2024, 1, 15),
          amount: mockDecimal(2000),
          account: { name: 'Big' },
          deletedAt: null,
        },
        {
          id: 'e7',
          date: new Date(2024, 2, 15),
          amount: mockDecimal(2000),
          account: { name: 'Big' },
          deletedAt: null,
        },
        {
          id: 'e8',
          date: new Date(2024, 3, 15),
          amount: mockDecimal(20000),
          account: { name: 'Big' },
          deletedAt: null,
        },
      ];

      prisma.expense.findMany.mockResolvedValue(expenses as any);
      prisma.invoice.findMany.mockResolvedValue([] as any);

      const result = await service.getOptimizationOpportunities(TEST_ORG_ID);

      if (result.opportunities.length >= 2) {
        for (let i = 0; i < result.opportunities.length - 1; i++) {
          expect(result.opportunities[i].potentialSavings).toBeGreaterThanOrEqual(
            result.opportunities[i + 1].potentialSavings,
          );
        }
      }
    });
  });

  describe('getEfficiencyMetrics', () => {
    it('should calculate revenue-to-expense ratio correctly', async () => {
      prisma.invoice.findMany.mockResolvedValue([
        { grandTotal: mockDecimal(10000), date: new Date(2024, 0, 15) },
        { grandTotal: mockDecimal(15000), date: new Date(2024, 6, 15) },
      ] as any);

      prisma.expense.findMany.mockResolvedValue([
        { amount: mockDecimal(5000), date: new Date(2024, 0, 15), account: { name: 'Ops' } },
        { amount: mockDecimal(5000), date: new Date(2024, 6, 15), account: { name: 'Ops' } },
      ] as any);

      prisma.employee.count.mockResolvedValue(5 as any);

      const result = await service.getEfficiencyMetrics(TEST_ORG_ID);

      expect(result.revenueToExpense).toBe(2.5); // 25000 / 10000
      expect(result.revenuePerEmployee).toBe(5000); // 25000 / 5
    });

    it('should return category efficiency breakdown', async () => {
      prisma.invoice.findMany.mockResolvedValue([
        { grandTotal: mockDecimal(50000), date: new Date(2024, 3, 15) },
      ] as any);

      prisma.expense.findMany.mockResolvedValue([
        { amount: mockDecimal(3000), date: new Date(2024, 3, 15), account: { name: 'Rent' } },
        { amount: mockDecimal(7000), date: new Date(2024, 3, 15), account: { name: 'Salaries' } },
      ] as any);

      prisma.employee.count.mockResolvedValue(10 as any);

      const result = await service.getEfficiencyMetrics(TEST_ORG_ID);

      expect(result.categoryEfficiency.length).toBe(2);
      expect(result.categoryEfficiency[0].category).toBe('Salaries'); // Higher total first
      expect(result.categoryEfficiency[0].totalExpenses).toBe(7000);
    });

    it('should determine improving trend when second half ratio is better', async () => {
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

      prisma.invoice.findMany.mockResolvedValue([
        { grandTotal: mockDecimal(5000), date: new Date(Date.now() - 250 * 86400000) }, // old
        { grandTotal: mockDecimal(20000), date: new Date(Date.now() - 30 * 86400000) }, // recent
      ] as any);

      prisma.expense.findMany.mockResolvedValue([
        {
          amount: mockDecimal(5000),
          date: new Date(Date.now() - 250 * 86400000),
          account: { name: 'Ops' },
        },
        {
          amount: mockDecimal(5000),
          date: new Date(Date.now() - 30 * 86400000),
          account: { name: 'Ops' },
        },
      ] as any);

      prisma.employee.count.mockResolvedValue(5 as any);

      const result = await service.getEfficiencyMetrics(TEST_ORG_ID);

      // First half: 5000/5000 = 1. Second half: 20000/5000 = 4. Improved.
      expect(result.trend).toBe('improving');
    });

    it('should return stable trend when ratio change is small', async () => {
      prisma.invoice.findMany.mockResolvedValue([] as any);
      prisma.expense.findMany.mockResolvedValue([] as any);
      prisma.employee.count.mockResolvedValue(0 as any);

      const result = await service.getEfficiencyMetrics(TEST_ORG_ID);

      expect(result.trend).toBe('stable');
      expect(result.revenueToExpense).toBe(0);
      expect(result.revenuePerEmployee).toBe(0);
    });
  });
});
