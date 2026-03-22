import { Test, TestingModule } from '@nestjs/testing';
import { AiFeedbackService } from './ai-feedback.service';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  createMockPrisma,
  MockPrismaClient,
  TEST_ORG_ID,
} from '../__tests__/fixtures/ai-test-helpers';

describe('AiFeedbackService', () => {
  let service: AiFeedbackService;
  let prisma: MockPrismaClient;

  const orgId = TEST_ORG_ID;
  const feature = 'CATEGORIZATION' as any;

  beforeEach(async () => {
    prisma = createMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [AiFeedbackService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<AiFeedbackService>(AiFeedbackService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getFeedbackStats', () => {
    it('should return zero stats when no feedback exists', async () => {
      prisma.aiFeedback.count.mockResolvedValue(0 as any);
      prisma.aiFeedback.groupBy.mockResolvedValue([] as any);

      const result = await service.getFeedbackStats(orgId, feature);

      expect(result.total).toBe(0);
      expect(result.accepted).toBe(0);
      expect(result.rejected).toBe(0);
      expect(result.corrected).toBe(0);
      expect(result.acceptanceRate).toBe(0);
      expect(result.rejectionRate).toBe(0);
      expect(result.correctionRate).toBe(0);
    });

    it('should calculate correct rates from feedback data', async () => {
      prisma.aiFeedback.count.mockResolvedValue(10 as any);
      prisma.aiFeedback.groupBy.mockResolvedValue([
        { userAction: 'ACCEPTED', _count: 7 },
        { userAction: 'REJECTED', _count: 2 },
        { userAction: 'CORRECTED', _count: 1 },
      ] as any);

      const result = await service.getFeedbackStats(orgId, feature);

      expect(result.total).toBe(10);
      expect(result.accepted).toBe(7);
      expect(result.rejected).toBe(2);
      expect(result.corrected).toBe(1);
      expect(result.acceptanceRate).toBeCloseTo(0.7, 2);
      expect(result.rejectionRate).toBeCloseTo(0.2, 2);
      expect(result.correctionRate).toBeCloseTo(0.1, 2);
    });

    it('should handle partial action types in groupBy', async () => {
      prisma.aiFeedback.count.mockResolvedValue(5 as any);
      prisma.aiFeedback.groupBy.mockResolvedValue([{ userAction: 'ACCEPTED', _count: 5 }] as any);

      const result = await service.getFeedbackStats(orgId, feature);

      expect(result.accepted).toBe(5);
      expect(result.rejected).toBe(0);
      expect(result.corrected).toBe(0);
    });
  });

  describe('invalidatePredictionCache', () => {
    it('should delete cached predictions and return count', async () => {
      prisma.aiPrediction.deleteMany.mockResolvedValue({ count: 10 } as any);

      const result = await service.invalidatePredictionCache(orgId, feature);

      expect(result.deleted).toBe(10);
    });

    it('should return 0 when no predictions to invalidate', async () => {
      prisma.aiPrediction.deleteMany.mockResolvedValue({ count: 0 } as any);

      const result = await service.invalidatePredictionCache(orgId, feature);

      expect(result.deleted).toBe(0);
    });
  });

  describe('deleteOldPredictions', () => {
    it('should delete predictions older than the specified date', async () => {
      prisma.aiPrediction.deleteMany.mockResolvedValue({ count: 15 } as any);
      const cutoffDate = new Date('2025-01-01');

      const result = await service.deleteOldPredictions(orgId, cutoffDate);

      expect(result.deleted).toBe(15);
      expect(prisma.aiPrediction.deleteMany).toHaveBeenCalledWith({
        where: {
          organizationId: orgId,
          createdAt: { lt: cutoffDate },
        },
      });
    });
  });
});
