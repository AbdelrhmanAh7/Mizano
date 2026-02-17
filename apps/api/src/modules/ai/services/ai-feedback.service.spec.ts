import { Test, TestingModule } from '@nestjs/testing';
import { AiFeedbackService, FeedbackDto } from './ai-feedback.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AiTrainingService } from './ai-training.service';
import {
  createMockPrisma,
  MockPrismaClient,
  createMockEventEmitter,
  createMockAiTraining,
  TEST_ORG_ID,
  mockDecimal,
} from '../__tests__/fixtures/ai-test-helpers';

describe('AiFeedbackService', () => {
  let service: AiFeedbackService;
  let prisma: MockPrismaClient;
  let eventEmitter: ReturnType<typeof createMockEventEmitter>;
  let trainingService: ReturnType<typeof createMockAiTraining>;

  const orgId = TEST_ORG_ID;
  const feature = 'CATEGORIZATION' as any;

  beforeEach(async () => {
    prisma = createMockPrisma();
    eventEmitter = createMockEventEmitter();
    trainingService = createMockAiTraining();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiFeedbackService,
        { provide: PrismaService, useValue: prisma },
        { provide: EventEmitter2, useValue: eventEmitter },
        { provide: AiTrainingService, useValue: trainingService },
      ],
    }).compile();

    service = module.get<AiFeedbackService>(AiFeedbackService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('processFeedback', () => {
    const baseFeedbackDto: FeedbackDto = {
      feature,
      aiSuggestion: { category: 'Office Supplies' },
      userAction: 'ACCEPTED' as any,
      inputData: { description: 'Printer paper' },
    };

    it('should store feedback and return id with shouldRetrain flag', async () => {
      prisma.aiFeedback.create.mockResolvedValue({
        id: 'fb-001',
        organizationId: orgId,
        feature,
        userAction: 'ACCEPTED',
      } as any);
      trainingService.countCorrectionsSinceLastTraining.mockResolvedValue(0);

      const result = await service.processFeedback(orgId, baseFeedbackDto);

      expect(result.id).toBe('fb-001');
      expect(result.shouldRetrain).toBe(false);
      expect(prisma.aiFeedback.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          organizationId: orgId,
          feature,
          userAction: 'ACCEPTED',
        }),
      });
    });

    it('should add training data when user corrects a suggestion', async () => {
      const correctionDto: FeedbackDto = {
        ...baseFeedbackDto,
        userAction: 'CORRECTED' as any,
        userAnswer: 'Travel Expenses',
      };
      prisma.aiFeedback.create.mockResolvedValue({
        id: 'fb-002',
      } as any);
      trainingService.countCorrectionsSinceLastTraining.mockResolvedValue(0);

      await service.processFeedback(orgId, correctionDto);

      expect(trainingService.addTrainingData).toHaveBeenCalledWith(
        orgId,
        feature,
        correctionDto.inputData,
        'Travel Expenses',
        'CORRECTION',
      );
    });

    it('should NOT add training data when user accepts suggestion', async () => {
      prisma.aiFeedback.create.mockResolvedValue({ id: 'fb-003' } as any);
      trainingService.countCorrectionsSinceLastTraining.mockResolvedValue(0);

      await service.processFeedback(orgId, baseFeedbackDto);

      expect(trainingService.addTrainingData).not.toHaveBeenCalled();
    });

    it('should trigger retraining when correction threshold is met', async () => {
      prisma.aiFeedback.create.mockResolvedValue({ id: 'fb-004' } as any);
      trainingService.countCorrectionsSinceLastTraining.mockResolvedValue(50); // CATEGORIZATION threshold is 50

      const result = await service.processFeedback(orgId, baseFeedbackDto);

      expect(result.shouldRetrain).toBe(true);
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'ai.retraining.needed',
        expect.objectContaining({
          organizationId: orgId,
          feature,
        }),
      );
    });

    it('should not trigger retraining when below threshold', async () => {
      prisma.aiFeedback.create.mockResolvedValue({ id: 'fb-005' } as any);
      trainingService.countCorrectionsSinceLastTraining.mockResolvedValue(10);

      const result = await service.processFeedback(orgId, baseFeedbackDto);

      expect(result.shouldRetrain).toBe(false);
    });
  });

  describe('checkRetrainingThreshold', () => {
    it('should return shouldRetrain=false when corrections are below threshold', async () => {
      trainingService.countCorrectionsSinceLastTraining.mockResolvedValue(5);

      const result = await service.checkRetrainingThreshold(orgId, feature);

      expect(result.shouldRetrain).toBe(false);
      expect(result.correctionCount).toBe(5);
      expect(result.threshold).toBe(50); // CATEGORIZATION = 50
    });

    it('should return shouldRetrain=true when corrections meet threshold', async () => {
      trainingService.countCorrectionsSinceLastTraining.mockResolvedValue(50);

      const result = await service.checkRetrainingThreshold(orgId, feature);

      expect(result.shouldRetrain).toBe(true);
      expect(result.correctionCount).toBe(50);
    });

    it('should return shouldRetrain=false with threshold 0 for disabled features', async () => {
      const result = await service.checkRetrainingThreshold(orgId, 'VOICE_COMMAND' as any);

      expect(result.shouldRetrain).toBe(false);
      expect(result.threshold).toBe(0);
    });
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

  describe('storePrediction', () => {
    it('should create a new prediction record and return id with hash', async () => {
      trainingService.generateInputHash.mockReturnValue('abc123');
      prisma.aiPrediction.findFirst.mockResolvedValue(null as any);
      prisma.aiPrediction.create.mockResolvedValue({
        id: 'pred-001',
      } as any);

      const result = await service.storePrediction(
        orgId,
        feature,
        { description: 'Test' },
        { category: 'Office' },
        0.85,
        1,
      );

      expect(result.id).toBe('pred-001');
      expect(result.inputHash).toBe('abc123');
    });

    it('should return existing prediction if cached within 1 hour', async () => {
      trainingService.generateInputHash.mockReturnValue('abc123');
      const recentDate = new Date();
      recentDate.setMinutes(recentDate.getMinutes() - 30); // 30 mins ago
      prisma.aiPrediction.findFirst.mockResolvedValue({
        id: 'pred-existing',
        createdAt: recentDate,
      } as any);

      const result = await service.storePrediction(
        orgId,
        feature,
        { description: 'Test' },
        { category: 'Office' },
        0.85,
        1,
      );

      expect(result.id).toBe('pred-existing');
      expect(prisma.aiPrediction.create).not.toHaveBeenCalled();
    });

    it('should create new prediction if cache is older than 1 hour', async () => {
      trainingService.generateInputHash.mockReturnValue('abc123');
      const oldDate = new Date();
      oldDate.setHours(oldDate.getHours() - 2); // 2 hours ago
      prisma.aiPrediction.findFirst.mockResolvedValue({
        id: 'pred-old',
        createdAt: oldDate,
      } as any);
      prisma.aiPrediction.create.mockResolvedValue({
        id: 'pred-new',
      } as any);

      const result = await service.storePrediction(
        orgId,
        feature,
        { description: 'Test' },
        { category: 'Office' },
        0.85,
        1,
      );

      expect(result.id).toBe('pred-new');
      expect(prisma.aiPrediction.create).toHaveBeenCalled();
    });
  });

  describe('getCachedPrediction', () => {
    it('should return null when no cached prediction exists', async () => {
      trainingService.generateInputHash.mockReturnValue('hash123');
      prisma.aiPrediction.findFirst.mockResolvedValue(null as any);

      const result = await service.getCachedPrediction(orgId, feature, { description: 'Test' });

      expect(result).toBeNull();
    });

    it('should return cached prediction with parsed confidence', async () => {
      trainingService.generateInputHash.mockReturnValue('hash123');
      prisma.aiPrediction.findFirst.mockResolvedValue({
        id: 'pred-001',
        prediction: { category: 'Office' },
        confidence: mockDecimal(0.85),
        modelVersion: 2,
      } as any);

      const result = await service.getCachedPrediction(orgId, feature, { description: 'Test' });

      expect(result).toBeDefined();
      expect(result!.prediction).toEqual({ category: 'Office' });
      expect(result!.confidence).toBe(0.85);
      expect(result!.modelVersion).toBe(2);
      expect(result!.predictionId).toBe('pred-001');
    });
  });

  describe('getRetrainingThreshold', () => {
    it('should return threshold for CATEGORIZATION', () => {
      expect(service.getRetrainingThreshold('CATEGORIZATION' as any)).toBe(50);
    });

    it('should return threshold for LEAD_SCORING', () => {
      expect(service.getRetrainingThreshold('LEAD_SCORING' as any)).toBe(20);
    });

    it('should return 0 for VOICE_COMMAND (disabled)', () => {
      expect(service.getRetrainingThreshold('VOICE_COMMAND' as any)).toBe(0);
    });

    it('should return threshold for FRAUD_DETECTION', () => {
      expect(service.getRetrainingThreshold('FRAUD_DETECTION' as any)).toBe(20);
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
