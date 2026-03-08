import { Test, TestingModule } from '@nestjs/testing';
import { CrossSellService } from './cross-sell.service';
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
  mockDecimal,
} from '../__tests__/fixtures/ai-test-helpers';

describe('CrossSellService', () => {
  let service: CrossSellService;
  let prisma: MockPrismaClient;
  let modelRegistry: {
    loadActiveModel: jest.Mock;
    saveModel: jest.Mock;
  };

  const orgId = TEST_ORG_ID;

  beforeEach(async () => {
    prisma = createMockPrisma();
    modelRegistry = {
      loadActiveModel: jest.fn().mockResolvedValue(null),
      saveModel: jest.fn().mockResolvedValue({ id: 'model-001', version: 1 }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CrossSellService,
        { provide: PrismaService, useValue: prisma },
        { provide: ModelRegistryService, useValue: modelRegistry },
        { provide: AiFeedbackService, useValue: createMockAiFeedback() },
        { provide: AiTrainingService, useValue: createMockAiTraining() },
        { provide: EventEmitter2, useValue: createMockEventEmitter() },
      ],
    }).compile();

    service = module.get<CrossSellService>(CrossSellService);
  });

  // ---------------------------------------------------------------------------
  // getRecommendations
  // ---------------------------------------------------------------------------
  describe('getRecommendations', () => {
    it('should return empty array when customer has no purchases', async () => {
      prisma.invoiceLine.findMany.mockResolvedValue([] as any);

      const result = await service.getRecommendations(orgId, 'cust-001');

      expect(result).toHaveLength(0);
    });

    it('should return recommendations based on co-occurrence matrix', async () => {
      // Customer has purchased items A and B
      prisma.invoiceLine.findMany.mockResolvedValue([
        { itemId: 'item-A' },
        { itemId: 'item-B' },
      ] as any);

      // Co-occurrence matrix: item-A co-occurs with item-C (5 times) and item-D (3 times)
      modelRegistry.loadActiveModel.mockResolvedValue({
        modelData: {
          coOccurrenceMatrix: {
            'item-A': { 'item-C': 5, 'item-D': 3 },
            'item-B': { 'item-C': 2, 'item-E': 7 },
            'item-C': { 'item-A': 5, 'item-B': 2 },
            'item-D': { 'item-A': 3 },
            'item-E': { 'item-B': 7 },
          },
        },
      } as any);

      // Item name lookups
      prisma.item.findMany.mockResolvedValue([
        { id: 'item-C', name: 'Widget C' },
        { id: 'item-E', name: 'Widget E' },
        { id: 'item-D', name: 'Widget D' },
      ] as any);

      const result = await service.getRecommendations(orgId, 'cust-001', 5);

      expect(result.length).toBeGreaterThan(0);
      // Items already purchased (A, B) should not be recommended
      const recommendedIds = result.map((r) => r.itemId);
      expect(recommendedIds).not.toContain('item-A');
      expect(recommendedIds).not.toContain('item-B');
    });

    it('should return empty when no co-occurrence model exists', async () => {
      prisma.invoiceLine.findMany.mockResolvedValue([{ itemId: 'item-A' }] as any);
      modelRegistry.loadActiveModel.mockResolvedValue(null as any);
      prisma.item.findMany.mockResolvedValue([] as any);

      const result = await service.getRecommendations(orgId, 'cust-001');

      expect(result).toHaveLength(0);
    });

    it('should respect the limit parameter', async () => {
      prisma.invoiceLine.findMany.mockResolvedValue([{ itemId: 'item-A' }] as any);

      modelRegistry.loadActiveModel.mockResolvedValue({
        modelData: {
          coOccurrenceMatrix: {
            'item-A': { 'item-B': 10, 'item-C': 8, 'item-D': 6, 'item-E': 4 },
          },
        },
      } as any);

      prisma.item.findMany.mockResolvedValue([
        { id: 'item-B', name: 'B' },
        { id: 'item-C', name: 'C' },
      ] as any);

      const result = await service.getRecommendations(orgId, 'cust-001', 2);

      expect(result.length).toBeLessThanOrEqual(2);
    });

    it('should cap score at 1.0', async () => {
      prisma.invoiceLine.findMany.mockResolvedValue([{ itemId: 'item-A' }] as any);

      modelRegistry.loadActiveModel.mockResolvedValue({
        modelData: {
          coOccurrenceMatrix: {
            'item-A': { 'item-B': 100 },
          },
        },
      } as any);

      prisma.item.findMany.mockResolvedValue([{ id: 'item-B', name: 'Big Item' }] as any);

      const result = await service.getRecommendations(orgId, 'cust-001');

      expect(result[0].score).toBeLessThanOrEqual(1);
    });
  });

  // ---------------------------------------------------------------------------
  // getUpsellRecommendations
  // ---------------------------------------------------------------------------
  describe('getUpsellRecommendations', () => {
    it('should return empty array when customer has no purchases', async () => {
      prisma.invoiceLine.findMany.mockResolvedValue([] as any);

      const result = await service.getUpsellRecommendations(orgId, 'cust-001');

      expect(result).toHaveLength(0);
    });

    it('should recommend higher-priced alternatives', async () => {
      prisma.invoiceLine.findMany.mockResolvedValue([{ itemId: 'item-basic' }] as any);

      // Current purchased item
      prisma.item.findMany
        .mockResolvedValueOnce([
          { id: 'item-basic', sellingPrice: mockDecimal(100), type: 'GOODS' },
        ] as any)
        // Upsell candidates
        .mockResolvedValueOnce([
          { id: 'item-premium', name: 'Premium Widget', sellingPrice: mockDecimal(200) },
        ] as any);

      const result = await service.getUpsellRecommendations(orgId, 'cust-001');

      expect(result.length).toBeGreaterThan(0);
      expect(result[0].reason).toContain('Premium alternative');
    });

    it('should not recommend already-purchased items', async () => {
      prisma.invoiceLine.findMany.mockResolvedValue([{ itemId: 'item-A' }] as any);

      prisma.item.findMany
        .mockResolvedValueOnce([
          { id: 'item-A', sellingPrice: mockDecimal(100), type: 'GOODS' },
        ] as any)
        .mockResolvedValueOnce([] as any); // no upsells

      const result = await service.getUpsellRecommendations(orgId, 'cust-001');

      const ids = result.map((r) => r.itemId);
      expect(ids).not.toContain('item-A');
    });
  });

  // ---------------------------------------------------------------------------
  // buildCoOccurrenceMatrix
  // ---------------------------------------------------------------------------
  describe('buildCoOccurrenceMatrix', () => {
    it('should build matrix from invoice line items', async () => {
      prisma.invoice.findMany.mockResolvedValue([
        {
          id: 'inv-1',
          lines: [{ itemId: 'item-A' }, { itemId: 'item-B' }, { itemId: 'item-C' }],
        },
        {
          id: 'inv-2',
          lines: [{ itemId: 'item-A' }, { itemId: 'item-C' }],
        },
      ] as any);

      const result = await service.buildCoOccurrenceMatrix(orgId);

      expect(result.totalTransactions).toBe(2);
      expect(result.itemPairs).toBeGreaterThan(0);
      expect(modelRegistry.saveModel).toHaveBeenCalled();
    });

    it('should return zero pairs when no invoices exist', async () => {
      prisma.invoice.findMany.mockResolvedValue([] as any);

      const result = await service.buildCoOccurrenceMatrix(orgId);

      expect(result.totalTransactions).toBe(0);
      expect(result.itemPairs).toBe(0);
    });

    it('should handle invoices with single items (no pairs)', async () => {
      prisma.invoice.findMany.mockResolvedValue([
        { id: 'inv-1', lines: [{ itemId: 'item-A' }] },
      ] as any);

      const result = await service.buildCoOccurrenceMatrix(orgId);

      expect(result.itemPairs).toBe(0);
      expect(result.totalTransactions).toBe(1);
    });

    it('should skip null itemIds in invoice lines', async () => {
      prisma.invoice.findMany.mockResolvedValue([
        {
          id: 'inv-1',
          lines: [{ itemId: 'item-A' }, { itemId: null }, { itemId: 'item-B' }],
        },
      ] as any);

      const result = await service.buildCoOccurrenceMatrix(orgId);

      // Only 1 valid pair (item-A, item-B)
      expect(result.itemPairs).toBe(1);
    });
  });

  // ---------------------------------------------------------------------------
  // getFrequentlyBoughtTogether
  // ---------------------------------------------------------------------------
  describe('getFrequentlyBoughtTogether', () => {
    it('should return empty when no model exists', async () => {
      modelRegistry.loadActiveModel.mockResolvedValue(null as any);

      const result = await service.getFrequentlyBoughtTogether(orgId, 'item-A');

      expect(result).toHaveLength(0);
    });

    it('should return associated items sorted by count', async () => {
      modelRegistry.loadActiveModel.mockResolvedValue({
        modelData: {
          coOccurrenceMatrix: {
            'item-A': { 'item-B': 10, 'item-C': 5, 'item-D': 2 },
          },
          totalTransactions: 20,
        },
      } as any);

      prisma.item.findMany.mockResolvedValue([
        { id: 'item-B', name: 'Item B' },
        { id: 'item-C', name: 'Item C' },
        { id: 'item-D', name: 'Item D' },
      ] as any);

      const result = await service.getFrequentlyBoughtTogether(orgId, 'item-A');

      expect(result).toHaveLength(3);
      expect(result[0].itemId).toBe('item-B');
      expect(result[0].coOccurrenceCount).toBe(10);
      expect(result[0].supportPercentage).toBe(50); // 10/20 * 100
    });

    it('should respect limit parameter', async () => {
      modelRegistry.loadActiveModel.mockResolvedValue({
        modelData: {
          coOccurrenceMatrix: {
            'item-A': { 'item-B': 10, 'item-C': 5, 'item-D': 2 },
          },
          totalTransactions: 20,
        },
      } as any);

      prisma.item.findMany.mockResolvedValue([{ id: 'item-B', name: 'B' }] as any);

      const result = await service.getFrequentlyBoughtTogether(orgId, 'item-A', 1);

      expect(result.length).toBeLessThanOrEqual(1);
    });

    it('should return empty for item not in matrix', async () => {
      modelRegistry.loadActiveModel.mockResolvedValue({
        modelData: {
          coOccurrenceMatrix: {},
          totalTransactions: 10,
        },
      } as any);
      prisma.item.findMany.mockResolvedValue([] as any);

      const result = await service.getFrequentlyBoughtTogether(orgId, 'item-unknown');

      expect(result).toHaveLength(0);
    });
  });
});
