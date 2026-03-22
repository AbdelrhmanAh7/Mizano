import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { LeadScoringService } from './lead-scoring.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { OllamaInferenceGateway } from './ollama-inference-gateway.service';
import { createMockPrisma, MockPrismaClient } from '../../../test/mocks/prisma.mock';

describe('LeadScoringService', () => {
  let service: LeadScoringService;
  let prisma: MockPrismaClient;

  const orgId = 'org-test-001';

  function createMockLead(overrides: Record<string, any> = {}) {
    return {
      id: 'lead-001',
      organizationId: orgId,
      leadName: 'John Doe',
      companyName: 'Acme Corp',
      email: 'john@acme.com',
      phone: '+1234567890',
      source: 'website',
      status: 'NEW',
      notes: null,
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date(),
      ...overrides,
    };
  }

  beforeEach(async () => {
    prisma = createMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LeadScoringService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: OllamaInferenceGateway,
          useValue: {
            infer: jest.fn().mockResolvedValue(null),
            isHealthy: jest.fn().mockResolvedValue(false),
            isAvailable: jest.fn().mockResolvedValue(false),
          },
        },
      ],
    }).compile();

    service = module.get<LeadScoringService>(LeadScoringService);
  });

  describe('scoreLead', () => {
    it('should throw NotFoundException when lead does not exist', async () => {
      prisma.lead.findFirst.mockResolvedValue(null as any);

      await expect(service.scoreLead(orgId, 'non-existent')).rejects.toThrow(NotFoundException);
    });

    it('should return a score between 0-100 for a valid lead', async () => {
      const lead = createMockLead();
      prisma.lead.findFirst.mockResolvedValue(lead as any);
      prisma.leadScore.findFirst.mockResolvedValue(null as any);
      prisma.leadScore.upsert.mockResolvedValue({} as any);

      const result = await service.scoreLead(orgId, lead.id);

      expect(result).toBeDefined();
      expect(result.totalScore).toBeGreaterThanOrEqual(0);
      expect(result.totalScore).toBeLessThanOrEqual(100);
      expect(result.demographicScore).toBeGreaterThanOrEqual(0);
      expect(result.behavioralScore).toBeGreaterThanOrEqual(0);
      expect(result.engagementScore).toBeGreaterThanOrEqual(0);
    });

    it('should return RULE_BASED predictionMethod when no ML model', async () => {
      const lead = createMockLead();
      prisma.lead.findFirst.mockResolvedValue(lead as any);
      prisma.leadScore.findFirst.mockResolvedValue(null as any);
      prisma.leadScore.upsert.mockResolvedValue({} as any);

      const result = await service.scoreLead(orgId, lead.id);

      expect(result.predictionMethod).toBe('RULE_BASED');
    });

    it('should assign tier based on score', async () => {
      // Lead with demo requested (high behavioral score) + recent activity
      const lead = createMockLead({
        notes: 'Interested in a demo',
        updatedAt: new Date(), // recent activity
      });
      prisma.lead.findFirst.mockResolvedValue(lead as any);
      prisma.leadScore.findFirst.mockResolvedValue(null as any);
      prisma.leadScore.upsert.mockResolvedValue({} as any);

      const result = await service.scoreLead(orgId, lead.id);

      expect(['HOT', 'WARM', 'COOL', 'COLD']).toContain(result.tier);
    });

    it('should include breakdown details', async () => {
      const lead = createMockLead();
      prisma.lead.findFirst.mockResolvedValue(lead as any);
      prisma.leadScore.findFirst.mockResolvedValue(null as any);
      prisma.leadScore.upsert.mockResolvedValue({} as any);

      const result = await service.scoreLead(orgId, lead.id);

      expect(result.breakdown).toBeInstanceOf(Array);
      expect(result.breakdown.length).toBeGreaterThan(0);
      // Each breakdown entry should have required fields
      for (const entry of result.breakdown) {
        expect(entry).toHaveProperty('category');
        expect(entry).toHaveProperty('rule');
        expect(entry).toHaveProperty('field');
        expect(entry).toHaveProperty('score');
        expect(entry).toHaveProperty('maxScore');
      }
    });

    it('should upsert lead score in database', async () => {
      const lead = createMockLead();
      prisma.lead.findFirst.mockResolvedValue(lead as any);
      prisma.leadScore.findFirst.mockResolvedValue(null as any);
      prisma.leadScore.upsert.mockResolvedValue({} as any);

      await service.scoreLead(orgId, lead.id);

      expect(prisma.leadScore.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { leadId: lead.id },
          update: expect.objectContaining({
            totalScore: expect.any(Number),
            tier: expect.any(String),
          }),
          create: expect.objectContaining({
            organizationId: orgId,
            leadId: lead.id,
            totalScore: expect.any(Number),
            tier: expect.any(String),
          }),
        }),
      );
    });

    it('should return conversion probability between 0 and 1', async () => {
      const lead = createMockLead();
      prisma.lead.findFirst.mockResolvedValue(lead as any);
      prisma.leadScore.findFirst.mockResolvedValue(null as any);
      prisma.leadScore.upsert.mockResolvedValue({} as any);

      const result = await service.scoreLead(orgId, lead.id);

      expect(result.conversionProbability).toBeGreaterThanOrEqual(0.01);
      expect(result.conversionProbability).toBeLessThanOrEqual(0.95);
    });
  });

  describe('scoreAllLeads', () => {
    it('should process all leads and return tier counts', async () => {
      const leads = [
        createMockLead({ id: 'lead-001' }),
        createMockLead({ id: 'lead-002' }),
        createMockLead({ id: 'lead-003' }),
      ];
      prisma.lead.findMany.mockResolvedValue(leads.map((l) => ({ id: l.id })) as any);
      // Each scoreLead call needs findFirst for the lead
      (prisma.lead.findFirst as jest.Mock).mockImplementation(
        async (args: { where?: { id?: string } }) => {
          const found = leads.find((l) => l.id === args?.where?.id);
          return found || null;
        },
      );
      prisma.leadScore.findFirst.mockResolvedValue(null as any);
      prisma.leadScore.upsert.mockResolvedValue({} as any);

      const result = await service.scoreAllLeads(orgId);

      expect(result.processed).toBe(3);
      expect(result.byTier.hot + result.byTier.warm + result.byTier.cool + result.byTier.cold).toBe(
        3,
      );
    });

    it('should return zero counts for empty organization', async () => {
      prisma.lead.findMany.mockResolvedValue([] as any);

      const result = await service.scoreAllLeads(orgId);

      expect(result.processed).toBe(0);
      expect(result.byTier).toEqual({ hot: 0, warm: 0, cool: 0, cold: 0 });
    });
  });

  describe('getScoreDistribution', () => {
    it('should return zero distribution for empty organization', async () => {
      prisma.leadScore.findMany.mockResolvedValue([] as any);

      const result = await service.getScoreDistribution(orgId);

      expect(result.avgScore).toBe(0);
      expect(result.medianScore).toBe(0);
      expect(result.byTier).toHaveLength(4);
    });

    it('should calculate distribution from existing scores', async () => {
      prisma.leadScore.findMany.mockResolvedValue([
        { totalScore: 90, tier: 'HOT' },
        { totalScore: 60, tier: 'WARM' },
        { totalScore: 30, tier: 'COOL' },
        { totalScore: 10, tier: 'COLD' },
      ] as any);

      const result = await service.getScoreDistribution(orgId);

      expect(result.avgScore).toBeCloseTo(47.5, 0);
      expect(result.medianScore).toBe(45); // (30+60)/2
      const hotTier = result.byTier.find((t) => t.tier === 'HOT');
      expect(hotTier?.count).toBe(1);
      expect(hotTier?.percentage).toBe(25);
    });
  });

  describe('getConversionPrediction', () => {
    it('should score the lead first if no existing score', async () => {
      prisma.leadScore.findFirst.mockResolvedValue(null as any);
      const lead = createMockLead();
      prisma.lead.findFirst.mockResolvedValue(lead as any);
      prisma.leadScore.upsert.mockResolvedValue({} as any);

      const result = await service.getConversionPrediction(orgId, 'lead-001');

      expect(result).toBeDefined();
      expect(result.probability).toBeGreaterThanOrEqual(0);
      expect(result.probability).toBeLessThanOrEqual(1);
      expect(['high', 'medium', 'low']).toContain(result.confidence);
      expect(result.factors).toBeInstanceOf(Array);
      expect(result.recommendation).toBeDefined();
    });
  });
});
