import { Test, TestingModule } from '@nestjs/testing';
import { SentimentAnalysisService } from './sentiment-analysis.service';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  createMockPrisma,
  MockPrismaClient,
  TEST_ORG_ID,
} from '../__tests__/fixtures/ai-test-helpers';

describe('SentimentAnalysisService', () => {
  let service: SentimentAnalysisService;
  let prisma: MockPrismaClient;

  const orgId = TEST_ORG_ID;

  beforeEach(async () => {
    prisma = createMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [SentimentAnalysisService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<SentimentAnalysisService>(SentimentAnalysisService);
  });

  // ---------------------------------------------------------------------------
  // analyzeText
  // ---------------------------------------------------------------------------
  describe('analyzeText', () => {
    it('should return positive sentiment for positive text', () => {
      const result = service.analyzeText(
        'This is an excellent product! I absolutely love it. Great quality and amazing service.',
      );

      expect(result.sentiment).toBe('positive');
      expect(result.comparative).toBeGreaterThan(0);
      expect(result.positive.length).toBeGreaterThan(0);
    });

    it('should return negative sentiment for negative text', () => {
      const result = service.analyzeText(
        'This is terrible. Awful quality, horrible experience. Very disappointing and bad service.',
      );

      expect(result.sentiment).toBe('negative');
      expect(result.comparative).toBeLessThan(0);
      expect(result.negative.length).toBeGreaterThan(0);
    });

    it('should return neutral sentiment for neutral text', () => {
      const result = service.analyzeText('The meeting is scheduled for Tuesday at the office.');

      expect(result.sentiment).toBe('neutral');
      expect(Math.abs(result.comparative)).toBeLessThanOrEqual(0.05);
    });

    it('should return neutral for empty text', () => {
      const result = service.analyzeText('');

      expect(result.sentiment).toBe('neutral');
      expect(result.score).toBe(0);
      expect(result.comparative).toBe(0);
      expect(result.positive).toHaveLength(0);
      expect(result.negative).toHaveLength(0);
    });

    it('should return neutral for whitespace-only text', () => {
      const result = service.analyzeText('   \n\t  ');

      expect(result.sentiment).toBe('neutral');
      expect(result.score).toBe(0);
    });

    it('should clamp comparative score between -1 and 1', () => {
      // Very extreme positive text
      const result = service.analyzeText('love love love love love love love love love love');

      expect(result.comparative).toBeLessThanOrEqual(1);
      expect(result.comparative).toBeGreaterThanOrEqual(-1);
    });

    it('should identify positive words correctly', () => {
      const result = service.analyzeText('This product is good and wonderful.');

      expect(result.positive).toContain('good');
    });

    it('should identify negative words correctly', () => {
      const result = service.analyzeText('This experience was bad and disappointing.');

      expect(result.negative.length).toBeGreaterThan(0);
    });

    it('should have score as raw AFINN sum', () => {
      const result = service.analyzeText('good');

      expect(typeof result.score).toBe('number');
      expect(result.score).not.toBe(0);
    });

    it('should handle mixed sentiment text', () => {
      const result = service.analyzeText(
        'The quality is excellent but the delivery was terrible and slow.',
      );

      // Should have both positive and negative words
      expect(result.positive.length).toBeGreaterThan(0);
      expect(result.negative.length).toBeGreaterThan(0);
    });
  });

  // ---------------------------------------------------------------------------
  // analyzeCustomerSentiment
  // ---------------------------------------------------------------------------
  describe('analyzeCustomerSentiment', () => {
    it('should return neutral when no data exists', async () => {
      prisma.invoice.findMany.mockResolvedValue([] as any);
      prisma.deal.findMany.mockResolvedValue([] as any);

      const result = await service.analyzeCustomerSentiment(orgId, 'cust-001');

      expect(result.averageSentiment).toBe(0);
      expect(result.sentiment).toBe('neutral');
      expect(result.sampleCount).toBe(0);
      expect(result.distribution).toEqual({ positive: 0, neutral: 0, negative: 0 });
      expect(result.details).toHaveLength(0);
    });

    it('should aggregate sentiment from invoice notes', async () => {
      prisma.invoice.findMany.mockResolvedValue([
        { notes: 'Great customer, always pays on time', date: new Date('2025-01-01') },
        { notes: 'Excellent relationship, pleasure to work with', date: new Date('2025-02-01') },
      ] as any);
      prisma.deal.findMany.mockResolvedValue([] as any);

      const result = await service.analyzeCustomerSentiment(orgId, 'cust-001');

      expect(result.sampleCount).toBe(2);
      expect(result.averageSentiment).toBeGreaterThan(0);
      expect(result.sentiment).toBe('positive');
    });

    it('should include activity log entries in analysis', async () => {
      prisma.invoice.findMany.mockResolvedValue([] as any);
      prisma.deal.findMany.mockResolvedValue([{ id: 'deal-1' }] as any);
      prisma.activityLog.findMany.mockResolvedValue([
        { description: 'Customer complained about late delivery', date: new Date('2025-01-01') },
      ] as any);

      const result = await service.analyzeCustomerSentiment(orgId, 'cust-001');

      expect(result.sampleCount).toBe(1);
    });

    it('should compute distribution correctly', async () => {
      prisma.invoice.findMany.mockResolvedValue([
        { notes: 'Wonderful experience', date: new Date('2025-01-01') },
        { notes: 'Standard transaction', date: new Date('2025-02-01') },
        { notes: 'Terrible delay', date: new Date('2025-03-01') },
      ] as any);
      prisma.deal.findMany.mockResolvedValue([] as any);

      const result = await service.analyzeCustomerSentiment(orgId, 'cust-001');

      expect(result.sampleCount).toBe(3);
      expect(
        result.distribution.positive + result.distribution.neutral + result.distribution.negative,
      ).toBe(3);
    });

    it('should truncate long text in details', async () => {
      const longNote = 'x'.repeat(500);
      prisma.invoice.findMany.mockResolvedValue([
        { notes: longNote, date: new Date('2025-01-01') },
      ] as any);
      prisma.deal.findMany.mockResolvedValue([] as any);

      const result = await service.analyzeCustomerSentiment(orgId, 'cust-001');

      expect(result.details[0].text.length).toBeLessThanOrEqual(204); // 200 + "..."
    });
  });

  // ---------------------------------------------------------------------------
  // getSentimentTrends
  // ---------------------------------------------------------------------------
  describe('getSentimentTrends', () => {
    it('should return empty array when no data exists', async () => {
      prisma.invoice.findMany.mockResolvedValue([] as any);

      const trends = await service.getSentimentTrends(orgId, 'customer', 'monthly');

      expect(trends).toHaveLength(0);
    });

    it('should group customer sentiment by monthly periods', async () => {
      prisma.invoice.findMany.mockResolvedValue([
        { notes: 'Great service', date: new Date('2025-01-15') },
        { notes: 'Good quality', date: new Date('2025-01-20') },
        { notes: 'Terrible delivery', date: new Date('2025-02-10') },
      ] as any);

      const trends = await service.getSentimentTrends(orgId, 'customer', 'monthly');

      expect(trends.length).toBeGreaterThanOrEqual(1);
      trends.forEach((point) => {
        expect(point.period).toBeDefined();
        expect(typeof point.averageSentiment).toBe('number');
        expect(['positive', 'negative', 'neutral']).toContain(point.sentiment);
        expect(point.sampleCount).toBeGreaterThan(0);
      });
    });

    it('should sort trend points chronologically', async () => {
      prisma.invoice.findMany.mockResolvedValue([
        { notes: 'Good', date: new Date('2025-03-01') },
        { notes: 'Bad', date: new Date('2025-01-01') },
        { notes: 'OK', date: new Date('2025-02-01') },
      ] as any);

      const trends = await service.getSentimentTrends(orgId, 'customer', 'monthly');

      for (let i = 1; i < trends.length; i++) {
        expect(trends[i].period >= trends[i - 1].period).toBe(true);
      }
    });

    it('should handle vendor entity type', async () => {
      prisma.bill.findMany.mockResolvedValue([
        { notes: 'Vendor delivered on time', date: new Date('2025-01-01') },
      ] as any);

      const trends = await service.getSentimentTrends(orgId, 'vendor', 'monthly');

      expect(trends.length).toBeGreaterThanOrEqual(1);
    });

    it('should handle lead entity type', async () => {
      prisma.lead.findMany.mockResolvedValue([
        { notes: 'Very interested lead', createdAt: new Date('2025-01-01') },
      ] as any);

      const trends = await service.getSentimentTrends(orgId, 'lead', 'monthly');

      expect(trends.length).toBeGreaterThanOrEqual(1);
    });

    it('should handle deal entity type', async () => {
      prisma.deal.findMany.mockResolvedValue([
        { lostReason: 'Too expensive and poor support', createdAt: new Date('2025-01-01') },
      ] as any);

      const trends = await service.getSentimentTrends(orgId, 'deal', 'monthly');

      expect(trends.length).toBeGreaterThanOrEqual(1);
    });

    it('should support quarterly period grouping', async () => {
      prisma.invoice.findMany.mockResolvedValue([
        { notes: 'Q1 feedback', date: new Date('2025-02-01') },
        { notes: 'Q2 feedback', date: new Date('2025-05-01') },
      ] as any);

      const trends = await service.getSentimentTrends(orgId, 'customer', 'quarterly');

      trends.forEach((point) => {
        expect(point.period).toMatch(/\d{4}-Q\d/);
      });
    });
  });
});
