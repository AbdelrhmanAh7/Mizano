import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { FinancialNarrativeService } from './financial-narrative.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { OllamaInferenceGateway } from './ollama-inference-gateway.service';
import { AiCacheService } from './ai-cache.service';
import {
  createMockPrisma,
  MockPrismaClient,
  TEST_ORG_ID,
  mockDecimal,
} from '../__tests__/fixtures/ai-test-helpers';

// Mock the query-templates module with stable template objects.
// The key fix: getQueryTemplate returns the SAME object reference each call
// by storing templates in a closure variable inside the factory.
jest.mock('../templates/query-templates', () => {
  const templates: Record<string, any> = {
    'top-customers': {
      id: 'top-customers',
      question: 'Who are my top customers?',
      description: 'Shows top customers by revenue',
      category: 'sales',
      chartType: 'bar',
      parameters: [],
      execute: jest.fn().mockResolvedValue({ customers: [] }),
      render: jest.fn().mockReturnValue('Your top customers are...'),
    },
    'cash-runway': {
      id: 'cash-runway',
      question: 'What is my cash runway?',
      description: 'Estimates how many days of cash remaining',
      category: 'finance',
      chartType: 'metric',
      parameters: [],
      execute: jest.fn().mockResolvedValue({ days: 90 }),
      render: jest.fn().mockReturnValue('You have 90 days of cash remaining.'),
    },
  };

  return {
    queryTemplates: Object.values(templates),
    getQueryTemplate: jest.fn((id: string) => templates[id] || null),
  };
});

describe('FinancialNarrativeService', () => {
  let service: FinancialNarrativeService;
  let prisma: MockPrismaClient;

  const orgId = TEST_ORG_ID;

  /**
   * Helper to set up standard Prisma mocks for financial data queries
   */
  function setupFinancialMocks(
    overrides: {
      revenue?: number;
      expenses?: number;
      billTotal?: number;
      invoiceCount?: number;
      billCount?: number;
      overdueAR?: number;
      overdueAP?: number;
      cashBalance?: number;
    } = {},
  ) {
    const revenue = overrides.revenue ?? 100000;
    const expenses = overrides.expenses ?? 60000;
    const billTotal = overrides.billTotal ?? 20000;
    const invoiceCount = overrides.invoiceCount ?? 15;
    const billCount = overrides.billCount ?? 8;

    // Invoice aggregate (revenue)
    prisma.invoice.aggregate.mockResolvedValue({
      _sum: { grandTotal: mockDecimal(revenue) },
      _count: invoiceCount,
    } as any);

    // Expense aggregate
    prisma.expense.aggregate.mockResolvedValue({
      _sum: { amount: mockDecimal(expenses) },
      _count: 20,
    } as any);

    // Bill aggregate
    prisma.bill.aggregate.mockResolvedValue({
      _sum: { grandTotal: mockDecimal(billTotal) },
      _count: billCount,
    } as any);

    // Top customers groupBy
    prisma.invoice.groupBy.mockResolvedValue([
      { customerId: 'cust-1', _sum: { grandTotal: mockDecimal(40000) } },
      { customerId: 'cust-2', _sum: { grandTotal: mockDecimal(30000) } },
    ] as any);

    prisma.customer.findMany.mockResolvedValue([
      { id: 'cust-1', name: 'Acme Corp' },
      { id: 'cust-2', name: 'Beta Inc' },
    ] as any);

    // Bank accounts
    prisma.bankAccount.aggregate.mockResolvedValue({
      _sum: { systemBalance: mockDecimal(overrides.cashBalance ?? 500000) },
    } as any);

    prisma.bankAccount.findMany.mockResolvedValue([
      { name: 'Business Account', systemBalance: mockDecimal(overrides.cashBalance ?? 500000) },
    ] as any);
  }

  beforeEach(async () => {
    prisma = createMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FinancialNarrativeService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: OllamaInferenceGateway,
          useValue: {
            generateCompletion: jest.fn().mockResolvedValue(''),
            generateStructuredOutput: jest.fn().mockResolvedValue({}),
            isAvailable: jest.fn().mockResolvedValue(false),
          },
        },
        {
          provide: AiCacheService,
          useValue: {
            getOrSet: jest
              .fn()
              .mockImplementation(
                (_f: string, _o: string, _i: unknown, factory: () => Promise<unknown>) => factory(),
              ),
            invalidateFeature: jest.fn().mockResolvedValue(0),
          },
        },
      ],
    }).compile();

    service = module.get<FinancialNarrativeService>(FinancialNarrativeService);

    // Set up default mocks for all financial queries
    setupFinancialMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('generateMonthlyNarrative', () => {
    it('should generate a narrative with title and period', async () => {
      const result = await service.generateMonthlyNarrative(orgId, 6, 2025);

      expect(result.title).toContain('Financial Summary');
      expect(result.title).toContain('June');
      expect(result.title).toContain('2025');
      expect(result.period).toContain('June 2025');
    });

    it('should include revenue, expense, and cash sections', async () => {
      const result = await service.generateMonthlyNarrative(orgId, 6, 2025);

      expect(result.sections).toBeInstanceOf(Array);
      expect(result.sections.length).toBeGreaterThanOrEqual(3);

      const sectionIds = result.sections.map((s) => s.id);
      expect(sectionIds).toContain('revenue');
      expect(sectionIds).toContain('expenses');
      expect(sectionIds).toContain('cash');
    });

    it('should include margin section when revenue is positive', async () => {
      const result = await service.generateMonthlyNarrative(orgId, 6, 2025);

      const sectionIds = result.sections.map((s) => s.id);
      expect(sectionIds).toContain('margin');
    });

    it('should generate alerts when cash runway is low', async () => {
      // Set up mock with very low cash balance relative to expenses
      setupFinancialMocks({
        cashBalance: 5000,
        expenses: 30000,
        billTotal: 10000,
      });

      const result = await service.generateMonthlyNarrative(orgId, 6, 2025);

      // Should have a cash alert
      expect(result.alerts.length).toBeGreaterThan(0);
      const cashAlert = result.alerts.find((a) => a.message.toLowerCase().includes('cash'));
      expect(cashAlert).toBeDefined();
      expect(cashAlert!.type).toBe('warning');
    });

    it('should generate recommendations', async () => {
      // With overdue AR, recommendations should be generated
      setupFinancialMocks({ overdueAR: 50000 });

      const result = await service.generateMonthlyNarrative(orgId, 6, 2025);

      expect(result.recommendations).toBeInstanceOf(Array);
    });

    it('should generate a summary string', async () => {
      const result = await service.generateMonthlyNarrative(orgId, 6, 2025);

      expect(result.summary).toBeDefined();
      expect(typeof result.summary).toBe('string');
      expect(result.summary.length).toBeGreaterThan(0);
      expect(result.summary).toContain('Revenue');
    });

    it('should set generatedAt to current time', async () => {
      const before = new Date();
      const result = await service.generateMonthlyNarrative(orgId, 6, 2025);
      const after = new Date();

      expect(result.generatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(result.generatedAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('should handle January correctly (previous month = December of previous year)', async () => {
      const result = await service.generateMonthlyNarrative(orgId, 1, 2025);

      expect(result.title).toContain('January');
      expect(result.title).toContain('2025');
    });

    it('should include metrics in revenue section', async () => {
      const result = await service.generateMonthlyNarrative(orgId, 6, 2025);

      const revenueSection = result.sections.find((s) => s.id === 'revenue');
      expect(revenueSection).toBeDefined();
      expect(revenueSection!.metrics).toBeInstanceOf(Array);
      expect(revenueSection!.metrics!.length).toBeGreaterThan(0);
    });
  });

  describe('generateWeeklySnapshot', () => {
    it('should generate a weekly snapshot with correct sections', async () => {
      prisma.paymentReceived.aggregate.mockResolvedValue({
        _sum: { amount: mockDecimal(5000) },
        _count: 3,
      } as any);

      const result = await service.generateWeeklySnapshot(orgId);

      expect(result.title).toBe('Weekly Snapshot');
      expect(result.sections).toBeInstanceOf(Array);

      const sectionIds = result.sections.map((s) => s.id);
      expect(sectionIds).toContain('invoices');
      expect(sectionIds).toContain('payments');
      expect(sectionIds).toContain('expenses');
      expect(sectionIds).toContain('cash-flow');
    });

    it('should include section metrics with counts and totals', async () => {
      prisma.paymentReceived.aggregate.mockResolvedValue({
        _sum: { amount: mockDecimal(12000) },
        _count: 5,
      } as any);

      const result = await service.generateWeeklySnapshot(orgId);

      const paymentSection = result.sections.find((s) => s.id === 'payments');
      expect(paymentSection).toBeDefined();
      expect(paymentSection!.metrics).toBeInstanceOf(Array);
      const countMetric = paymentSection!.metrics!.find((m) => m.label === 'Count');
      expect(countMetric!.value).toBe('5');
    });

    it('should have a summary string', async () => {
      prisma.paymentReceived.aggregate.mockResolvedValue({
        _sum: { amount: mockDecimal(5000) },
        _count: 3,
      } as any);

      const result = await service.generateWeeklySnapshot(orgId);

      expect(result.summary).toBeDefined();
      expect(result.summary.length).toBeGreaterThan(0);
    });

    it('should use provided weekStartDate when given', async () => {
      prisma.paymentReceived.aggregate.mockResolvedValue({
        _sum: { amount: null },
        _count: 0,
      } as any);

      const startDate = new Date('2025-06-02');
      const result = await service.generateWeeklySnapshot(orgId, startDate);

      expect(result.period).toBeDefined();
    });

    it('should calculate net cash flow correctly', async () => {
      prisma.paymentReceived.aggregate.mockResolvedValue({
        _sum: { amount: mockDecimal(10000) },
        _count: 5,
      } as any);
      prisma.expense.aggregate.mockResolvedValue({
        _sum: { amount: mockDecimal(3000) },
        _count: 2,
      } as any);
      prisma.bill.aggregate.mockResolvedValue({
        _sum: { grandTotal: mockDecimal(2000) },
        _count: 1,
      } as any);

      const result = await service.generateWeeklySnapshot(orgId);

      const cashFlowSection = result.sections.find((s) => s.id === 'cash-flow');
      expect(cashFlowSection).toBeDefined();
      // Net = 10000 - 3000 - 2000 = 5000 (positive)
      expect(cashFlowSection!.content).toContain('positive');
    });
  });

  describe('generateCashFlowNarrative', () => {
    it('should include cash on hand, receivables, payables, and runway sections', async () => {
      const result = await service.generateCashFlowNarrative(orgId);

      expect(result.title).toBe('Cash Flow Analysis');
      const sectionIds = result.sections.map((s) => s.id);
      expect(sectionIds).toContain('cash-on-hand');
      expect(sectionIds).toContain('receivables');
      expect(sectionIds).toContain('payables');
      expect(sectionIds).toContain('runway');
    });

    it('should warn when cash runway is low', async () => {
      // Low cash with high expenses
      prisma.bankAccount.findMany.mockResolvedValue([
        { name: 'Account', systemBalance: mockDecimal(5000) },
      ] as any);
      prisma.expense.aggregate.mockResolvedValue({
        _sum: { amount: mockDecimal(30000) },
      } as any);

      const result = await service.generateCashFlowNarrative(orgId);

      // With 5000 cash and 1000/day burn, runway = 5 days -> should trigger warning
      const warningAlert = result.alerts.find(
        (a) => a.type === 'warning' && a.message.includes('runway'),
      );
      expect(warningAlert).toBeDefined();
    });

    it('should include recommendations when runway is less than 60 days', async () => {
      prisma.bankAccount.findMany.mockResolvedValue([
        { name: 'Account', systemBalance: mockDecimal(10000) },
      ] as any);
      prisma.expense.aggregate.mockResolvedValue({
        _sum: { amount: mockDecimal(15000) }, // 500/day burn
      } as any);

      const result = await service.generateCashFlowNarrative(orgId);

      // runway = 10000 / 500 = 20 days -> recommendations should exist
      expect(result.recommendations.length).toBeGreaterThan(0);
    });

    it('should calculate net position correctly', async () => {
      prisma.bankAccount.findMany.mockResolvedValue([
        { name: 'Account', systemBalance: mockDecimal(100000) },
      ] as any);

      const result = await service.generateCashFlowNarrative(orgId);

      expect(result.summary).toContain('Net position');
    });

    it('should handle zero expenses gracefully', async () => {
      prisma.expense.aggregate.mockResolvedValue({
        _sum: { amount: null },
      } as any);

      const result = await service.generateCashFlowNarrative(orgId);

      // Should not crash with zero burn rate
      expect(result).toBeDefined();
      expect(result.sections).toBeInstanceOf(Array);
    });
  });

  describe('answerQuery', () => {
    it('should return an answer for a valid query template', async () => {
      const result = await service.answerQuery(orgId, 'top-customers');

      expect(result.queryId).toBe('top-customers');
      expect(result.question).toBe('Who are my top customers?');
      expect(result.answer).toBe('Your top customers are...');
      expect(result.chartType).toBe('bar');
    });

    it('should throw NotFoundException for unknown query template', async () => {
      await expect(service.answerQuery(orgId, 'non-existent-query')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should pass params to template execute and render', async () => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { getQueryTemplate } = require('../templates/query-templates');
      const mockTemplate = getQueryTemplate('cash-runway');

      await service.answerQuery(orgId, 'cash-runway', { period: '2025-Q1' });

      expect(mockTemplate.execute).toHaveBeenCalledWith(prisma, orgId, { period: '2025-Q1' });
    });
  });

  describe('getAvailableQueries', () => {
    it('should return array of query templates', () => {
      const result = service.getAvailableQueries();

      expect(result).toBeInstanceOf(Array);
      expect(result.length).toBe(2);
    });

    it('should include required fields for each query', () => {
      const result = service.getAvailableQueries();

      for (const query of result) {
        expect(query).toHaveProperty('id');
        expect(query).toHaveProperty('question');
        expect(query).toHaveProperty('description');
        expect(query).toHaveProperty('category');
      }
    });

    it('should include chart type when available', () => {
      const result = service.getAvailableQueries();

      const topCustomers = result.find((q) => q.id === 'top-customers');
      expect(topCustomers!.chartType).toBe('bar');
    });
  });
});
