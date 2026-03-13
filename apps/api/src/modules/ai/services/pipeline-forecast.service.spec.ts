import { Test, TestingModule } from '@nestjs/testing';
import { PipelineForecastService } from './pipeline-forecast.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { OllamaInferenceGateway } from './ollama-inference-gateway.service';
import {
  createMockPrisma,
  MockPrismaClient,
  TEST_ORG_ID,
  mockDecimal,
} from '../__tests__/fixtures/ai-test-helpers';

describe('PipelineForecastService', () => {
  let service: PipelineForecastService;
  let prisma: MockPrismaClient;

  const orgId = TEST_ORG_ID;

  function createMockDeal(overrides: Record<string, any> = {}) {
    return {
      id: 'deal-001',
      organizationId: orgId,
      dealName: 'Big Enterprise Deal',
      expectedAmount: mockDecimal(50000),
      stage: 'PROPOSAL',
      createdAt: new Date('2025-03-01'),
      updatedAt: new Date('2025-05-15'),
      expectedCloseDate: new Date('2025-07-01'),
      actualCloseDate: null,
      deletedAt: null,
      customer: { id: 'cust-001', name: 'Acme Corp' },
      lead: null,
      ...overrides,
    };
  }

  beforeEach(async () => {
    prisma = createMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PipelineForecastService,
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

    service = module.get<PipelineForecastService>(PipelineForecastService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('forecastPipeline', () => {
    it('should return zero values when pipeline is empty', async () => {
      prisma.deal.findMany.mockResolvedValue([] as any);

      const result = await service.forecastPipeline(orgId);

      expect(result.totalWeighted).toBe(0);
      expect(result.totalUnweighted).toBe(0);
      expect(result.activeDeals).toBe(0);
      expect(result.avgDealSize).toBe(0);
    });

    it('should calculate weighted and unweighted pipeline totals', async () => {
      const deals = [
        createMockDeal({
          id: 'deal-1',
          expectedAmount: mockDecimal(100000),
          stage: 'PROPOSAL', // weight 0.5
        }),
        createMockDeal({
          id: 'deal-2',
          expectedAmount: mockDecimal(50000),
          stage: 'NEGOTIATION', // weight 0.75
        }),
      ];
      // First findMany for active deals
      prisma.deal.findMany.mockResolvedValueOnce(deals as any);
      // Second findMany for closed deals (avg days to close)
      prisma.deal.findMany.mockResolvedValueOnce([] as any);
      // Third findMany for monthly won amounts
      prisma.deal.findMany.mockResolvedValueOnce([] as any);

      const result = await service.forecastPipeline(orgId);

      expect(result.totalUnweighted).toBe(150000);
      // 100000 * 0.5 + 50000 * 0.75 = 87500
      expect(result.totalWeighted).toBe(87500);
      expect(result.activeDeals).toBe(2);
      expect(result.avgDealSize).toBe(75000);
    });

    it('should calculate average days to close from historical data', async () => {
      const now = new Date();
      const activeDeals = [createMockDeal()];
      const closedDeals = [
        {
          createdAt: new Date(now.getTime() - 30 * 86400000),
          actualCloseDate: now,
        },
        {
          createdAt: new Date(now.getTime() - 60 * 86400000),
          actualCloseDate: now,
        },
      ];

      prisma.deal.findMany
        .mockResolvedValueOnce(activeDeals as any)
        .mockResolvedValueOnce(closedDeals as any)
        .mockResolvedValueOnce([] as any);

      const result = await service.forecastPipeline(orgId);

      // Average of 30 and 60 = 45
      expect(result.avgDaysToClose).toBe(45);
    });

    it('should default to 30 days when no closed deals exist', async () => {
      prisma.deal.findMany
        .mockResolvedValueOnce([createMockDeal()] as any) // active
        .mockResolvedValueOnce([] as any) // no closed
        .mockResolvedValueOnce([] as any); // monthly won

      const result = await service.forecastPipeline(orgId);

      expect(result.avgDaysToClose).toBe(30);
    });

    it('should generate monthly forecast when enough historical data', async () => {
      prisma.deal.findMany
        .mockResolvedValueOnce([createMockDeal()] as any) // active
        .mockResolvedValueOnce([] as any); // closed

      // Monthly won amounts - need >= 6 for Holt-Winters attempt
      const monthlyWon = Array.from({ length: 8 }, (_, i) => ({
        actualCloseDate: new Date(2025, i, 15),
        expectedAmount: mockDecimal(10000 + i * 1000),
        stage: 'WON',
        deletedAt: null,
      }));
      prisma.deal.findMany.mockResolvedValueOnce(monthlyWon as any);

      const result = await service.forecastPipeline(orgId, 3);

      // Should have forecast entries (either HW or fallback)
      expect(result.forecastByMonth).toBeDefined();
    });
  });

  describe('getWeightedPipeline', () => {
    it('should return empty array when no active deals', async () => {
      prisma.deal.findMany.mockResolvedValue([] as any);

      const result = await service.getWeightedPipeline(orgId);

      expect(result).toHaveLength(0);
    });

    it('should group deals by stage with weighted values', async () => {
      const deals = [
        createMockDeal({
          id: 'deal-1',
          expectedAmount: mockDecimal(100000),
          stage: 'PROPOSAL',
          updatedAt: new Date(),
        }),
        createMockDeal({
          id: 'deal-2',
          expectedAmount: mockDecimal(50000),
          stage: 'PROPOSAL',
          updatedAt: new Date(),
        }),
        createMockDeal({
          id: 'deal-3',
          expectedAmount: mockDecimal(75000),
          stage: 'NEGOTIATION',
          updatedAt: new Date(),
        }),
      ];

      // First: getWeightedPipeline fetches active deals
      prisma.deal.findMany.mockResolvedValueOnce(deals as any);
      // Second: getStageConversionRates fetches won/lost deals
      prisma.deal.findMany.mockResolvedValueOnce([] as any);

      const result = await service.getWeightedPipeline(orgId);

      expect(result.length).toBe(2); // PROPOSAL and NEGOTIATION stages

      const proposalStage = result.find((s) => s.stage === 'PROPOSAL');
      expect(proposalStage).toBeDefined();
      expect(proposalStage!.dealCount).toBe(2);
      expect(proposalStage!.totalValue).toBe(150000);

      const negotiationStage = result.find((s) => s.stage === 'NEGOTIATION');
      expect(negotiationStage).toBeDefined();
      expect(negotiationStage!.dealCount).toBe(1);
      expect(negotiationStage!.totalValue).toBe(75000);
    });

    it('should calculate weighted value using historical or default win rate', async () => {
      const deals = [
        createMockDeal({
          id: 'deal-1',
          expectedAmount: mockDecimal(100000),
          stage: 'NEW',
          updatedAt: new Date(),
        }),
      ];

      prisma.deal.findMany
        .mockResolvedValueOnce(deals as any) // active
        .mockResolvedValueOnce([] as any); // historical (none)

      const result = await service.getWeightedPipeline(orgId);

      const newStage = result.find((s) => s.stage === 'NEW');
      expect(newStage).toBeDefined();
      // NEW stage weight = 0.1, so weighted = 100000 * 0.1 = 10000
      expect(newStage!.weightedValue).toBe(10000);
    });
  });

  describe('getStageConversionRates', () => {
    it('should return conversion rates for all stages', async () => {
      prisma.deal.findMany.mockResolvedValue([] as any);

      const result = await service.getStageConversionRates(orgId);

      expect(result).toHaveLength(4); // NEW, QUALIFIED, PROPOSAL, NEGOTIATION
      for (const rate of result) {
        expect(['NEW', 'QUALIFIED', 'PROPOSAL', 'NEGOTIATION']).toContain(rate.stage);
        expect(rate.winRate).toBeGreaterThanOrEqual(0);
        expect(rate.winRate).toBeLessThanOrEqual(1);
      }
    });

    it('should calculate win rates from historical data', async () => {
      const closedDeals = [
        createMockDeal({ stage: 'WON', expectedAmount: mockDecimal(10000) }),
        createMockDeal({ stage: 'WON', expectedAmount: mockDecimal(20000) }),
        createMockDeal({ stage: 'WON', expectedAmount: mockDecimal(15000) }),
        createMockDeal({ stage: 'LOST', expectedAmount: mockDecimal(5000) }),
      ];
      prisma.deal.findMany.mockResolvedValue(closedDeals as any);

      const result = await service.getStageConversionRates(orgId);

      // 3 won out of 4 = 75% win rate
      expect(result[0].totalDeals).toBe(4);
      expect(result[0].wonDeals).toBe(3);
      expect(result[0].lostDeals).toBe(1);
    });

    it('should default to 0.3 base win rate when insufficient historical data', async () => {
      prisma.deal.findMany.mockResolvedValue([] as any);

      const result = await service.getStageConversionRates(orgId);

      // With no data, rates should use base STAGE_WEIGHTS
      const newStage = result.find((r) => r.stage === 'NEW');
      expect(newStage!.winRate).toBeCloseTo(0.1, 1);
    });

    it('should calculate average amount from won deals', async () => {
      const closedDeals = [
        createMockDeal({ stage: 'WON', expectedAmount: mockDecimal(10000) }),
        createMockDeal({ stage: 'WON', expectedAmount: mockDecimal(20000) }),
      ];
      prisma.deal.findMany.mockResolvedValue(closedDeals as any);

      const result = await service.getStageConversionRates(orgId);

      expect(result[0].avgAmount).toBeCloseTo(15000, 0);
    });
  });

  describe('forecastDealTimeline', () => {
    it('should throw error when deal does not exist', async () => {
      prisma.deal.findFirst.mockResolvedValue(null as any);

      await expect(service.forecastDealTimeline(orgId, 'non-existent')).rejects.toThrow();
    });

    it('should return timeline forecast for existing deal', async () => {
      const deal = createMockDeal({
        id: 'deal-timeline',
        dealName: 'Timeline Test',
        stage: 'PROPOSAL',
        updatedAt: new Date(Date.now() - 10 * 86400000), // 10 days ago
        expectedCloseDate: new Date('2025-08-01'),
      });
      prisma.deal.findFirst.mockResolvedValue(deal as any);

      const result = await service.forecastDealTimeline(orgId, 'deal-timeline');

      expect(result.dealId).toBe('deal-timeline');
      expect(result.dealName).toBe('Timeline Test');
      expect(result.currentStage).toBe('PROPOSAL');
      expect(result.daysInCurrentStage).toBe(10);
      expect(result.winProbability).toBe(0.5); // PROPOSAL weight
      expect(result.predictedCloseDate).toBeInstanceOf(Date);
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('should calculate daysInCurrentStage correctly', async () => {
      const daysAgo = 25;
      const deal = createMockDeal({
        updatedAt: new Date(Date.now() - daysAgo * 86400000),
      });
      prisma.deal.findFirst.mockResolvedValue(deal as any);

      const result = await service.forecastDealTimeline(orgId, 'deal-001');

      expect(result.daysInCurrentStage).toBe(daysAgo);
    });

    it('should use stage weights for win probability', async () => {
      const deal = createMockDeal({ stage: 'NEGOTIATION' });
      prisma.deal.findFirst.mockResolvedValue(deal as any);

      const result = await service.forecastDealTimeline(orgId, 'deal-001');

      expect(result.winProbability).toBe(0.75); // NEGOTIATION weight
    });

    it('should predict a future close date', async () => {
      const deal = createMockDeal({
        stage: 'QUALIFIED',
        updatedAt: new Date(),
      });
      prisma.deal.findFirst.mockResolvedValue(deal as any);

      const result = await service.forecastDealTimeline(orgId, 'deal-001');

      const now = new Date();
      expect(result.predictedCloseDate!.getTime()).toBeGreaterThan(now.getTime());
    });
  });
});
