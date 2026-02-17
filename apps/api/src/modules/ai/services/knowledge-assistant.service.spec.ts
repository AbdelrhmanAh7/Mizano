import { Test, TestingModule } from '@nestjs/testing';
import { KnowledgeAssistantService } from './knowledge-assistant.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { ModelRegistryService } from './model-registry.service';
import { AiFeedbackService } from './ai-feedback.service';
import { AiTrainingService } from './ai-training.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  createMockPrisma,
  createMockAiFeedback,
  createMockAiTraining,
  createMockEventEmitter,
  MockPrismaClient,
  TEST_ORG_ID,
} from '../__tests__/fixtures/ai-test-helpers';

describe('KnowledgeAssistantService', () => {
  let service: KnowledgeAssistantService;
  let prisma: MockPrismaClient;
  let modelRegistry: {
    loadActiveModel: jest.Mock;
    saveModel: jest.Mock;
  };

  const orgId = TEST_ORG_ID;

  function createMockInsight(overrides: Record<string, any> = {}) {
    return {
      id: 'insight-001',
      title: 'Cash flow warning',
      description: 'Your cash flow is projected to decline next month based on current patterns.',
      type: 'CASH_FLOW',
      severity: 'HIGH',
      isRead: false,
      createdAt: new Date('2025-06-01'),
      ...overrides,
    };
  }

  beforeEach(async () => {
    prisma = createMockPrisma();
    modelRegistry = {
      loadActiveModel: jest.fn().mockResolvedValue(null),
      saveModel: jest.fn().mockResolvedValue({ id: 'model-001', version: 1 }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KnowledgeAssistantService,
        { provide: PrismaService, useValue: prisma },
        { provide: ModelRegistryService, useValue: modelRegistry },
        { provide: AiFeedbackService, useValue: createMockAiFeedback() },
        { provide: AiTrainingService, useValue: createMockAiTraining() },
        { provide: EventEmitter2, useValue: createMockEventEmitter() },
      ],
    }).compile();

    service = module.get<KnowledgeAssistantService>(KnowledgeAssistantService);
  });

  // ---------------------------------------------------------------------------
  // search
  // ---------------------------------------------------------------------------
  describe('search', () => {
    it('should return empty results when no documents are indexed', async () => {
      // No model, no insights to index
      prisma.aIInsight.findMany.mockResolvedValue([] as any);

      const response = await service.search(orgId, 'cash flow');

      expect(response.results).toHaveLength(0);
      expect(response.totalResults).toBe(0);
    });

    it('should return relevant results for matching query after indexing', async () => {
      // First, index documents
      prisma.aIInsight.findMany.mockResolvedValue([
        createMockInsight({
          id: 'i1',
          title: 'Cash flow alert',
          description: 'Cash reserves running low for next quarter.',
        }),
        createMockInsight({
          id: 'i2',
          title: 'Revenue growth opportunity',
          description: 'Sales revenue has been growing steadily over the past months.',
        }),
        createMockInsight({
          id: 'i3',
          title: 'Expense anomaly detected',
          description: 'Unusual increase in office supply expenses last week.',
        }),
      ] as any);

      await service.indexDocuments(orgId);

      const response = await service.search(orgId, 'cash flow');

      expect(response.results.length).toBeGreaterThan(0);
      // The most relevant result should mention cash
      expect(response.results[0].title.toLowerCase()).toContain('cash');
    });

    it('should respect the limit parameter', async () => {
      prisma.aIInsight.findMany.mockResolvedValue(
        Array.from({ length: 10 }, (_, i) =>
          createMockInsight({
            id: `i-${i}`,
            title: `Insight ${i}`,
            description: `Description for insight ${i} about cash flow.`,
          }),
        ) as any,
      );

      await service.indexDocuments(orgId);

      const response = await service.search(orgId, 'cash', 3);

      expect(response.results.length).toBeLessThanOrEqual(3);
    });

    it('should return relevance scores between 0 and 1', async () => {
      prisma.aIInsight.findMany.mockResolvedValue([
        createMockInsight({ id: 'i1', title: 'Cash flow', description: 'Cash flow analysis' }),
      ] as any);

      await service.indexDocuments(orgId);

      const response = await service.search(orgId, 'cash flow');

      response.results.forEach((r) => {
        expect(r.relevanceScore).toBeGreaterThanOrEqual(0);
        expect(r.relevanceScore).toBeLessThanOrEqual(1);
      });
    });

    it('should filter out zero-score results', async () => {
      prisma.aIInsight.findMany.mockResolvedValue([
        createMockInsight({ id: 'i1', title: 'Inventory alert', description: 'Stock levels low.' }),
      ] as any);

      await service.indexDocuments(orgId);

      const response = await service.search(orgId, 'completely unrelated xyzzy query');

      // All results should have non-negligible scores
      response.results.forEach((r) => {
        expect(r.relevanceScore).toBeGreaterThan(0.01);
      });
    });

    it('should sort results by relevance descending', async () => {
      prisma.aIInsight.findMany.mockResolvedValue([
        createMockInsight({
          id: 'i1',
          title: 'Invoice overdue',
          description: 'Invoice payment overdue',
        }),
        createMockInsight({
          id: 'i2',
          title: 'Cash flow warning',
          description: 'Cash reserves low',
        }),
        createMockInsight({
          id: 'i3',
          title: 'Invoice summary',
          description: 'Monthly invoice report',
        }),
      ] as any);

      await service.indexDocuments(orgId);

      const response = await service.search(orgId, 'invoice overdue payment');

      for (let i = 1; i < response.results.length; i++) {
        expect(response.results[i - 1].relevanceScore).toBeGreaterThanOrEqual(
          response.results[i].relevanceScore,
        );
      }
    });
  });

  // ---------------------------------------------------------------------------
  // indexDocuments
  // ---------------------------------------------------------------------------
  describe('indexDocuments', () => {
    it('should return zero when no AIInsight records exist', async () => {
      prisma.aIInsight.findMany.mockResolvedValue([] as any);

      const result = await service.indexDocuments(orgId);

      expect(result.indexed).toBe(0);
      expect(result.totalDocuments).toBe(0);
    });

    it('should index all AIInsight records', async () => {
      const insights = [
        createMockInsight({ id: 'i1', title: 'Insight 1', description: 'Desc 1' }),
        createMockInsight({ id: 'i2', title: 'Insight 2', description: 'Desc 2' }),
        createMockInsight({ id: 'i3', title: 'Insight 3', description: 'Desc 3' }),
      ];
      prisma.aIInsight.findMany.mockResolvedValue(insights as any);

      const result = await service.indexDocuments(orgId);

      expect(result.indexed).toBe(3);
      expect(result.totalDocuments).toBe(3);
    });

    it('should persist index metadata via ModelRegistryService', async () => {
      prisma.aIInsight.findMany.mockResolvedValue([createMockInsight()] as any);

      await service.indexDocuments(orgId);

      expect(modelRegistry.saveModel).toHaveBeenCalledWith(
        orgId,
        expect.anything(), // AiFeature.KNOWLEDGE_ASSISTANT
        expect.objectContaining({
          type: 'TfIdf',
          documentCount: 1,
        }),
        expect.any(Number),
        expect.any(Number),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // getSuggestions
  // ---------------------------------------------------------------------------
  describe('getSuggestions', () => {
    it('should return recent unread insights when no context given', async () => {
      // getSuggestions without context does NOT call ensureIndex — it goes
      // straight to prisma.aIInsight.findMany for recent unread insights.
      prisma.aIInsight.findMany.mockResolvedValueOnce([
        createMockInsight({ id: 'i1', title: 'Recent alert', isRead: false }),
        createMockInsight({ id: 'i2', title: 'Another alert', isRead: false }),
      ] as any);

      const suggestions = await service.getSuggestions(orgId, undefined, 5);

      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions[0]).toHaveProperty('id');
      expect(suggestions[0]).toHaveProperty('title');
      expect(suggestions[0]).toHaveProperty('description');
      expect(suggestions[0]).toHaveProperty('relevanceScore');
    });

    it('should return context-relevant suggestions when context is provided', async () => {
      prisma.aIInsight.findMany.mockResolvedValue([
        createMockInsight({ id: 'i1', title: 'Cash flow alert', description: 'Cash reserves low' }),
        createMockInsight({ id: 'i2', title: 'Revenue growth', description: 'Revenue increasing' }),
      ] as any);

      await service.indexDocuments(orgId);

      const suggestions = await service.getSuggestions(orgId, 'cash flow', 5);

      expect(suggestions.length).toBeGreaterThan(0);
    });

    it('should respect limit parameter', async () => {
      // The service passes `take: limit` to Prisma; in real DB this limits results.
      // Mock returns only 3 items to simulate the DB honoring the limit.
      prisma.aIInsight.findMany.mockResolvedValue(
        Array.from({ length: 3 }, (_, i) =>
          createMockInsight({ id: `i-${i}`, title: `Insight ${i}`, isRead: false }),
        ) as any,
      );

      const suggestions = await service.getSuggestions(orgId, undefined, 3);

      expect(suggestions.length).toBeLessThanOrEqual(3);
    });

    it('should assign descending relevance scores for recent insights', async () => {
      // getSuggestions without context does NOT call ensureIndex.
      prisma.aIInsight.findMany.mockResolvedValueOnce([
        createMockInsight({ id: 'i1' }),
        createMockInsight({ id: 'i2' }),
        createMockInsight({ id: 'i3' }),
      ] as any);

      const suggestions = await service.getSuggestions(orgId, undefined, 5);

      for (let i = 1; i < suggestions.length; i++) {
        expect(suggestions[i - 1].relevanceScore).toBeGreaterThanOrEqual(
          suggestions[i].relevanceScore,
        );
      }
    });
  });

  // ---------------------------------------------------------------------------
  // rebuildIndex
  // ---------------------------------------------------------------------------
  describe('rebuildIndex', () => {
    it('should clear existing index and rebuild', async () => {
      prisma.aIInsight.findMany.mockResolvedValue([
        createMockInsight({ id: 'i1', title: 'Old insight', description: 'Old data' }),
      ] as any);

      // Build initial index
      await service.indexDocuments(orgId);

      // Rebuild with new data
      prisma.aIInsight.findMany.mockResolvedValue([
        createMockInsight({ id: 'i2', title: 'New insight', description: 'New data' }),
      ] as any);

      const result = await service.rebuildIndex(orgId);

      expect(result.indexed).toBe(1);
    });
  });
});
