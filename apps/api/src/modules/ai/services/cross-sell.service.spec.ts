import { Test, TestingModule } from '@nestjs/testing';
import { CrossSellService } from './cross-sell.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { AiFeedbackService } from './ai-feedback.service';
import { OllamaInferenceGateway } from './ollama-inference-gateway.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  createMockPrisma,
  createMockAiFeedback,
  createMockEventEmitter,
  MockPrismaClient,
  TEST_ORG_ID,
  mockDecimal,
} from '../__tests__/fixtures/ai-test-helpers';

describe('CrossSellService', () => {
  let service: CrossSellService;
  let prisma: MockPrismaClient;

  const orgId = TEST_ORG_ID;

  beforeEach(async () => {
    prisma = createMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CrossSellService,
        { provide: PrismaService, useValue: prisma },
        { provide: AiFeedbackService, useValue: createMockAiFeedback() },
        { provide: EventEmitter2, useValue: createMockEventEmitter() },
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

      prisma.item.findMany
        .mockResolvedValueOnce([
          { id: 'item-basic', sellingPrice: mockDecimal(100), type: 'GOODS' },
        ] as any)
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
        .mockResolvedValueOnce([] as any);

      const result = await service.getUpsellRecommendations(orgId, 'cust-001');

      const ids = result.map((r) => r.itemId);
      expect(ids).not.toContain('item-A');
    });
  });
});
