import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AiFeedbackService } from '../../services/ai-feedback.service';
import { AiTrainingService } from '../../services/ai-training.service';
import { ModelRegistryService } from '../../services/model-registry.service';
import { PrismaService } from '../../../../prisma/prisma.service';
import { createMockPrisma, TEST_ORG_ID } from '../fixtures/ai-test-helpers';

/**
 * Integration test for the AI Retraining Pipeline.
 *
 * Tests the full flow: User Feedback → Training Data → Model Retrain → Improved Predictions.
 * Validates that the feedback loop closes properly so models improve over time.
 */
describe('AiRetrainingPipeline (Integration)', () => {
  let feedbackService: AiFeedbackService;
  let trainingService: AiTrainingService;
  let modelRegistryService: ModelRegistryService;
  let prisma: ReturnType<typeof createMockPrisma>;
  let eventEmitter: EventEmitter2;

  beforeEach(async () => {
    prisma = createMockPrisma();
    eventEmitter = new EventEmitter2();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiFeedbackService,
        AiTrainingService,
        ModelRegistryService,
        { provide: PrismaService, useValue: prisma },
        { provide: EventEmitter2, useValue: eventEmitter },
      ],
    }).compile();

    feedbackService = module.get<AiFeedbackService>(AiFeedbackService);
    trainingService = module.get<AiTrainingService>(AiTrainingService);
    modelRegistryService = module.get<ModelRegistryService>(ModelRegistryService);
  });

  /**
   * Helper: mock the chain that checkRetrainingThreshold needs:
   * 1. aiModel.findFirst → last trained model (for countCorrectionsSinceLastTraining)
   * 2. aiTrainingData.count → number of corrections since last training
   */
  function mockCorrectionCount(count: number) {
    // countCorrectionsSinceLastTraining calls aiModel.findFirst then aiTrainingData.count
    prisma.aiModel.findFirst.mockResolvedValue(null); // no last model → counts all corrections
    prisma.aiTrainingData.count.mockResolvedValue(count);
  }

  describe('Feedback → Training Data Flow', () => {
    it('should store feedback and create training data on correction', async () => {
      const feedbackId = 'feedback-001';

      prisma.aiFeedback.create.mockResolvedValue({
        id: feedbackId,
        organizationId: TEST_ORG_ID,
        feature: 'CATEGORIZATION',
        userAction: 'CORRECTED',
        aiSuggestion: { category: 'Office Supplies' },
        userAnswer: 'Software License',
        inputData: { description: 'Annual license renewal', amount: 499.99 },
        createdAt: new Date(),
      } as any);

      prisma.aiTrainingData.create.mockResolvedValue({
        id: 'training-001',
        organizationId: TEST_ORG_ID,
        feature: 'CATEGORIZATION',
        inputData: { description: 'Annual license renewal', amount: 499.99 },
        label: 'Software License',
        source: 'CORRECTION',
        createdAt: new Date(),
      } as any);

      // Below threshold (CATEGORIZATION = 50)
      mockCorrectionCount(3);

      const result = await feedbackService.processFeedback(TEST_ORG_ID, {
        feature: 'CATEGORIZATION' as any,
        aiSuggestion: { category: 'Office Supplies' },
        userAction: 'CORRECTED' as any,
        userAnswer: 'Software License',
        inputData: { description: 'Annual license renewal', amount: 499.99 },
      });

      expect(result).toBeDefined();
      expect(result.id).toBe(feedbackId);

      expect(prisma.aiFeedback.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            organizationId: TEST_ORG_ID,
            feature: 'CATEGORIZATION',
            userAction: 'CORRECTED',
          }),
        }),
      );
    });

    it('should trigger retraining when correction threshold is met', async () => {
      prisma.aiFeedback.create.mockResolvedValue({
        id: 'feedback-threshold',
        organizationId: TEST_ORG_ID,
        feature: 'CATEGORIZATION',
        userAction: 'CORRECTED',
        aiSuggestion: { category: 'Wrong' },
        userAnswer: 'Correct',
        inputData: {},
        createdAt: new Date(),
      } as any);

      prisma.aiTrainingData.create.mockResolvedValue({
        id: 'td-threshold',
        organizationId: TEST_ORG_ID,
        feature: 'CATEGORIZATION',
        inputData: {},
        label: 'Correct',
        source: 'CORRECTION',
        createdAt: new Date(),
      } as any);

      // CATEGORIZATION threshold is 50 — mock 50 corrections to trigger
      mockCorrectionCount(50);

      const result = await feedbackService.processFeedback(TEST_ORG_ID, {
        feature: 'CATEGORIZATION' as any,
        aiSuggestion: { category: 'Wrong' },
        userAction: 'CORRECTED' as any,
        userAnswer: 'Correct',
        inputData: { description: 'test' },
      });

      expect(result.shouldRetrain).toBe(true);
    });

    it('should not trigger retraining for accepted predictions', async () => {
      prisma.aiFeedback.create.mockResolvedValue({
        id: 'feedback-accepted',
        organizationId: TEST_ORG_ID,
        feature: 'CATEGORIZATION',
        userAction: 'ACCEPTED',
        aiSuggestion: { category: 'Office Supplies' },
        inputData: {},
        createdAt: new Date(),
      } as any);

      // Below threshold
      mockCorrectionCount(0);

      const result = await feedbackService.processFeedback(TEST_ORG_ID, {
        feature: 'CATEGORIZATION' as any,
        aiSuggestion: { category: 'Office Supplies' },
        userAction: 'ACCEPTED' as any,
        inputData: { description: 'Printer paper', amount: 29.99 },
      });

      expect(result.shouldRetrain).toBe(false);
    });
  });

  describe('Training Data Accumulation', () => {
    it('should accumulate training data from multiple corrections', async () => {
      const trainingRecords = [
        {
          id: 'td-1',
          feature: 'CATEGORIZATION',
          inputData: { description: 'Office chairs' },
          label: 'Furniture',
          source: 'USER',
          createdAt: new Date('2024-01-01'),
        },
        {
          id: 'td-2',
          feature: 'CATEGORIZATION',
          inputData: { description: 'Desk lamps' },
          label: 'Furniture',
          source: 'USER',
          createdAt: new Date('2024-01-02'),
        },
        {
          id: 'td-3',
          feature: 'CATEGORIZATION',
          inputData: { description: 'Laptop' },
          label: 'Electronics',
          source: 'USER',
          createdAt: new Date('2024-01-03'),
        },
      ];

      prisma.aiTrainingData.findMany.mockResolvedValue(trainingRecords as any);
      prisma.aiTrainingData.count.mockResolvedValue(3);

      const result = await trainingService.getTrainingData(TEST_ORG_ID, 'CATEGORIZATION' as any);

      expect(result.data).toHaveLength(3);
      expect(result.total).toBe(3);
    });

    it('should provide training readiness assessment', async () => {
      prisma.aiTrainingData.count.mockResolvedValue(50);
      // groupBy with _count: true returns _count as a number
      prisma.aiTrainingData.groupBy.mockResolvedValue([
        { label: 'Office Supplies', _count: 20 },
        { label: 'Software', _count: 15 },
        { label: 'Hardware', _count: 15 },
      ] as any);

      const readiness = await trainingService.validateTrainingReadiness(
        TEST_ORG_ID,
        'CATEGORIZATION' as any,
      );

      expect(readiness.isReady).toBe(true);
      expect(readiness.currentSamples).toBe(50);
      expect(readiness.warnings).toHaveLength(0);
    });

    it('should warn when training data is insufficient', async () => {
      prisma.aiTrainingData.count.mockResolvedValue(3);
      prisma.aiTrainingData.groupBy.mockResolvedValue([
        { label: 'Office Supplies', _count: 3 },
      ] as any);

      const readiness = await trainingService.validateTrainingReadiness(
        TEST_ORG_ID,
        'CATEGORIZATION' as any,
      );

      expect(readiness.isReady).toBe(false);
      expect(readiness.currentSamples).toBe(3);
      expect(readiness.warnings.length).toBeGreaterThan(0);
    });

    it('should split data into train/test sets', async () => {
      const records = Array.from({ length: 100 }, (_, i) => ({
        id: `td-${i}`,
        feature: 'CATEGORIZATION',
        inputData: { description: `Item ${i}` },
        label: i % 3 === 0 ? 'A' : i % 3 === 1 ? 'B' : 'C',
        source: 'USER',
        createdAt: new Date(`2024-01-${(i % 28) + 1}`),
      }));

      prisma.aiTrainingData.findMany.mockResolvedValue(records as any);

      const split = await trainingService.getTrainTestSplit(
        TEST_ORG_ID,
        'CATEGORIZATION' as any,
        0.2,
      );

      expect(split.train.length).toBeGreaterThan(0);
      expect(split.test.length).toBeGreaterThan(0);
      expect(split.train.length).toBeGreaterThan(split.test.length);
    });
  });

  describe('Model Registry Lifecycle', () => {
    it('should save and load a trained model', async () => {
      const modelData = {
        weights: [0.1, 0.2, 0.3],
        featureNames: ['amount', 'frequency', 'recency'],
        threshold: 0.5,
      };

      prisma.aiModel.findFirst.mockResolvedValue(null);
      prisma.aiModel.create.mockResolvedValue({
        id: 'model-001',
        organizationId: TEST_ORG_ID,
        feature: 'CATEGORIZATION',
        version: 1,
        modelData,
        accuracy: 0.85,
        sampleCount: 100,
        status: 'ACTIVE',
        trainedAt: new Date(),
        createdAt: new Date(),
      } as any);
      prisma.aiModel.updateMany.mockResolvedValue({ count: 0 });

      const saveResult = await modelRegistryService.saveModel(
        TEST_ORG_ID,
        'CATEGORIZATION' as any,
        modelData,
        0.85,
        100,
      );

      expect(saveResult.id).toBe('model-001');
      expect(saveResult.version).toBe(1);

      // Load the model back
      prisma.aiModel.findFirst.mockResolvedValue({
        id: 'model-001',
        version: 1,
        modelData,
        accuracy: 0.85,
        sampleCount: 100,
        status: 'ACTIVE',
        trainedAt: new Date(),
      } as any);

      const loaded = await modelRegistryService.loadActiveModel(
        TEST_ORG_ID,
        'CATEGORIZATION' as any,
      );

      expect(loaded).toBeDefined();
      expect(loaded?.version).toBe(1);
      expect(loaded?.accuracy).toBe(0.85);
      expect(loaded?.modelData).toEqual(modelData);
    });

    it('should handle model versioning correctly', async () => {
      prisma.aiModel.findFirst.mockResolvedValue({
        id: 'model-v2',
        version: 2,
        status: 'ACTIVE',
      } as any);

      prisma.aiModel.create.mockResolvedValue({
        id: 'model-v3',
        version: 3,
        modelData: { weights: [0.4, 0.5] },
        accuracy: 0.9,
        sampleCount: 200,
        status: 'ACTIVE',
        trainedAt: new Date(),
      } as any);

      prisma.aiModel.updateMany.mockResolvedValue({ count: 1 });

      const result = await modelRegistryService.saveModel(
        TEST_ORG_ID,
        'CATEGORIZATION' as any,
        { weights: [0.4, 0.5] },
        0.9,
        200,
      );

      expect(result.version).toBe(3);
    });

    it('should validate model accuracy before promoting', async () => {
      prisma.aiModel.findFirst
        .mockResolvedValueOnce({
          id: 'model-old',
          version: 1,
          accuracy: 0.85,
          status: 'ACTIVE',
        } as any)
        .mockResolvedValueOnce({
          id: 'model-old',
          version: 1,
          accuracy: 0.85,
          status: 'ACTIVE',
        } as any);

      prisma.aiModel.create.mockResolvedValue({
        id: 'model-new',
        version: 2,
        accuracy: 0.88,
        sampleCount: 200,
        status: 'ACTIVE',
        modelData: {},
        trainedAt: new Date(),
      } as any);

      prisma.aiModel.updateMany.mockResolvedValue({ count: 1 });

      const result = await modelRegistryService.saveModelWithValidation(
        TEST_ORG_ID,
        'CATEGORIZATION' as any,
        { weights: [0.5, 0.6] },
        0.88,
        200,
      );

      expect(result.promoted).toBe(true);
    });

    it('should reject model with lower accuracy than current', async () => {
      prisma.aiModel.findFirst.mockResolvedValue({
        id: 'model-current',
        version: 3,
        accuracy: 0.9,
        status: 'ACTIVE',
      } as any);

      prisma.aiModel.create.mockResolvedValue({
        id: 'model-worse',
        version: 4,
        accuracy: 0.75,
        sampleCount: 50,
        status: 'INACTIVE',
        modelData: {},
        trainedAt: new Date(),
      } as any);

      const result = await modelRegistryService.saveModelWithValidation(
        TEST_ORG_ID,
        'CATEGORIZATION' as any,
        { weights: [0.1] },
        0.75,
        50,
      );

      expect(result.promoted).toBe(false);
    });

    it('should track accuracy trend over model versions', async () => {
      // Need >= 4 entries for trend detection (service compares recent 3 vs older 3)
      // findMany returns newest first (orderBy version desc)
      const history = [
        { version: 5, accuracy: 0.9, trainedAt: new Date('2024-05-01'), status: 'ACTIVE' },
        { version: 4, accuracy: 0.87, trainedAt: new Date('2024-04-01'), status: 'RETIRED' },
        { version: 3, accuracy: 0.82, trainedAt: new Date('2024-03-01'), status: 'RETIRED' },
        { version: 2, accuracy: 0.75, trainedAt: new Date('2024-02-01'), status: 'RETIRED' },
        { version: 1, accuracy: 0.7, trainedAt: new Date('2024-01-01'), status: 'RETIRED' },
      ];

      prisma.aiModel.findMany.mockResolvedValue(history as any);

      const trend = await modelRegistryService.getAccuracyTrend(
        TEST_ORG_ID,
        'CATEGORIZATION' as any,
      );

      expect(trend.trend).toBe('improving');
      expect(trend.currentAccuracy).toBe(0.9);
      expect(trend.history).toHaveLength(5);
      expect(trend.degradationDetected).toBe(false);
    });

    it('should detect degrading accuracy trend', async () => {
      // Newer models have lower accuracy (degrading)
      const history = [
        { version: 5, accuracy: 0.65, trainedAt: new Date('2024-05-01'), status: 'ACTIVE' },
        { version: 4, accuracy: 0.7, trainedAt: new Date('2024-04-01'), status: 'RETIRED' },
        { version: 3, accuracy: 0.75, trainedAt: new Date('2024-03-01'), status: 'RETIRED' },
        { version: 2, accuracy: 0.85, trainedAt: new Date('2024-02-01'), status: 'RETIRED' },
        { version: 1, accuracy: 0.9, trainedAt: new Date('2024-01-01'), status: 'RETIRED' },
      ];

      prisma.aiModel.findMany.mockResolvedValue(history as any);

      const trend = await modelRegistryService.getAccuracyTrend(
        TEST_ORG_ID,
        'CATEGORIZATION' as any,
      );

      expect(trend.trend).toBe('degrading');
      expect(trend.degradationDetected).toBe(true);
    });
  });

  describe('Model Rollback', () => {
    it('should rollback to a previous model version', async () => {
      // activateModel uses findUnique with compound key
      prisma.aiModel.findUnique.mockResolvedValue({
        id: 'model-v2',
        organizationId: TEST_ORG_ID,
        feature: 'CATEGORIZATION',
        version: 2,
        accuracy: 0.85,
        status: 'RETIRED',
        modelData: { weights: [0.3, 0.4] },
      } as any);

      prisma.aiModel.updateMany.mockResolvedValue({ count: 1 });
      prisma.aiModel.update.mockResolvedValue({
        id: 'model-v2',
        version: 2,
        status: 'ACTIVE',
      } as any);

      const result = await modelRegistryService.rollbackModel(
        TEST_ORG_ID,
        'CATEGORIZATION' as any,
        2,
      );

      expect(result.version).toBe(2);
    });
  });

  describe('Full Retraining Cycle', () => {
    it('should complete full cycle: feedback → training data → check readiness → model save', async () => {
      // Step 1: Record correction feedback
      prisma.aiFeedback.create.mockResolvedValue({
        id: 'fb-1',
        organizationId: TEST_ORG_ID,
        feature: 'LEAD_SCORING',
        userAction: 'CORRECTED',
        aiSuggestion: { score: 45 },
        userAnswer: '78',
        inputData: { company: 'Test Corp', revenue: 500000 },
        createdAt: new Date(),
      } as any);

      prisma.aiTrainingData.create.mockResolvedValue({
        id: 'td-fb1',
        organizationId: TEST_ORG_ID,
        feature: 'LEAD_SCORING',
        inputData: { company: 'Test Corp', revenue: 500000 },
        label: '78',
        source: 'CORRECTION',
        createdAt: new Date(),
      } as any);

      // LEAD_SCORING threshold is 20 — mock 20 corrections
      prisma.aiModel.findFirst.mockResolvedValue(null);
      prisma.aiTrainingData.count.mockResolvedValue(20);

      const feedback = await feedbackService.processFeedback(TEST_ORG_ID, {
        feature: 'LEAD_SCORING' as any,
        aiSuggestion: { score: 45 },
        userAction: 'CORRECTED' as any,
        userAnswer: '78',
        inputData: { company: 'Test Corp', revenue: 500000 },
      });

      expect(feedback.shouldRetrain).toBe(true);

      // Step 2: Check training readiness
      prisma.aiTrainingData.count.mockResolvedValue(100);
      prisma.aiTrainingData.groupBy.mockResolvedValue([
        { label: 'high', _count: 40 },
        { label: 'medium', _count: 35 },
        { label: 'low', _count: 25 },
      ] as any);

      const readiness = await trainingService.validateTrainingReadiness(
        TEST_ORG_ID,
        'LEAD_SCORING' as any,
      );

      expect(readiness.isReady).toBe(true);

      // Step 3: Save new model (simulating post-training)
      prisma.aiModel.findFirst.mockResolvedValue({
        id: 'model-prev',
        version: 2,
        accuracy: 0.78,
        status: 'ACTIVE',
      } as any);

      prisma.aiModel.create.mockResolvedValue({
        id: 'model-new',
        version: 3,
        accuracy: 0.84,
        sampleCount: 100,
        status: 'ACTIVE',
        modelData: { type: 'random-forest', trees: 50 },
        trainedAt: new Date(),
      } as any);

      prisma.aiModel.updateMany.mockResolvedValue({ count: 1 });

      const savedModel = await modelRegistryService.saveModelWithValidation(
        TEST_ORG_ID,
        'LEAD_SCORING' as any,
        { type: 'random-forest', trees: 50 },
        0.84,
        100,
      );

      expect(savedModel.promoted).toBe(true);
      expect(savedModel.version).toBe(3);
    });
  });

  describe('Prediction Caching', () => {
    it('should store and retrieve cached predictions', async () => {
      const predictionData = {
        score: 72,
        category: 'high',
        factors: ['revenue', 'engagement'],
      };

      prisma.aiPrediction.create.mockResolvedValue({
        id: 'pred-001',
        organizationId: TEST_ORG_ID,
        feature: 'LEAD_SCORING',
        inputData: { company: 'Big Corp' },
        inputHash: 'hash-abc123',
        prediction: predictionData,
        confidence: 0.88,
        modelVersion: 3,
        createdAt: new Date(),
      } as any);

      const stored = await feedbackService.storePrediction(
        TEST_ORG_ID,
        'LEAD_SCORING' as any,
        { company: 'Big Corp' },
        predictionData,
        0.88,
        3,
      );

      expect(stored.id).toBe('pred-001');

      prisma.aiPrediction.findFirst.mockResolvedValue({
        id: 'pred-001',
        prediction: predictionData,
        confidence: 0.88,
        modelVersion: 3,
        createdAt: new Date(),
      } as any);

      const cached = await feedbackService.getCachedPrediction(TEST_ORG_ID, 'LEAD_SCORING' as any, {
        company: 'Big Corp',
      });

      expect(cached).toBeDefined();
      expect(cached?.prediction).toEqual(predictionData);
      expect(cached?.confidence).toBe(0.88);
    });

    it('should invalidate cache when model is retrained', async () => {
      prisma.aiPrediction.deleteMany.mockResolvedValue({ count: 25 });

      const result = await feedbackService.invalidatePredictionCache(
        TEST_ORG_ID,
        'LEAD_SCORING' as any,
      );

      expect(result.deleted).toBe(25);
    });

    it('should invalidate cache on model activation event', async () => {
      prisma.aiPrediction.deleteMany.mockResolvedValue({ count: 10 });

      // Directly call the handler since @OnEvent may not be wired in test module
      await (feedbackService as any).onModelActivated({
        organizationId: TEST_ORG_ID,
        feature: 'LEAD_SCORING',
        version: 4,
      });

      expect(prisma.aiPrediction.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: TEST_ORG_ID,
            feature: 'LEAD_SCORING',
          }),
        }),
      );
    });
  });

  describe('Feedback Statistics', () => {
    it('should calculate feedback stats for a feature', async () => {
      // getFeedbackStats uses Promise.all([count, groupBy])
      prisma.aiFeedback.count.mockResolvedValue(100);
      prisma.aiFeedback.groupBy.mockResolvedValue([
        { userAction: 'ACCEPTED', _count: 70 },
        { userAction: 'REJECTED', _count: 10 },
        { userAction: 'CORRECTED', _count: 20 },
      ] as any);

      const stats = await feedbackService.getFeedbackStats(TEST_ORG_ID, 'CATEGORIZATION' as any);

      expect(stats.total).toBe(100);
      expect(stats.accepted).toBe(70);
      expect(stats.rejectionRate).toBeCloseTo(0.1);
      expect(stats.correctionRate).toBeCloseTo(0.2);
      expect(stats.acceptanceRate).toBeCloseTo(0.7);
    });

    it('should handle zero feedback gracefully', async () => {
      prisma.aiFeedback.count.mockResolvedValue(0);
      prisma.aiFeedback.groupBy.mockResolvedValue([] as any);

      const stats = await feedbackService.getFeedbackStats(TEST_ORG_ID, 'CATEGORIZATION' as any);

      expect(stats.total).toBe(0);
      expect(stats.acceptanceRate).toBe(0);
    });
  });

  describe('Training Data Management', () => {
    it('should seed initial training data', async () => {
      prisma.aiTrainingData.createMany.mockResolvedValue({ count: 50 });

      const records = Array.from({ length: 50 }, (_, i) => ({
        inputData: { description: `Item ${i}`, amount: Math.random() * 1000 },
        label: ['Office Supplies', 'Software', 'Hardware'][i % 3],
      }));

      const result = await trainingService.seedTrainingData(
        TEST_ORG_ID,
        'CATEGORIZATION' as any,
        records,
      );

      expect(result.inserted).toBe(50);
    });

    it('should clean up old training data', async () => {
      const olderThan = new Date('2023-06-01');

      prisma.aiTrainingData.deleteMany.mockResolvedValue({ count: 120 });

      const result = await trainingService.deleteOldTrainingData(
        TEST_ORG_ID,
        'CATEGORIZATION' as any,
        olderThan,
      );

      expect(result.deleted).toBe(120);
      expect(prisma.aiTrainingData.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: TEST_ORG_ID,
            feature: 'CATEGORIZATION',
            createdAt: { lt: olderThan },
          }),
        }),
      );
    });

    it('should get label distribution for model analysis', async () => {
      // groupBy with _count: true returns _count as a number
      prisma.aiTrainingData.groupBy.mockResolvedValue([
        { label: 'Office Supplies', _count: 30 },
        { label: 'Software', _count: 25 },
        { label: 'Hardware', _count: 20 },
        { label: 'Travel', _count: 15 },
        { label: 'Marketing', _count: 10 },
      ] as any);

      const distribution = await trainingService.getLabelDistribution(
        TEST_ORG_ID,
        'CATEGORIZATION' as any,
      );

      expect(distribution['Office Supplies']).toBe(30);
      expect(distribution['Software']).toBe(25);
      expect(Object.keys(distribution)).toHaveLength(5);
    });
  });

  describe('Model Retirement', () => {
    it('should retire old model versions keeping only the latest N', async () => {
      prisma.aiModel.updateMany.mockResolvedValue({ count: 5 });
      prisma.aiModel.findMany.mockResolvedValue([
        { version: 8, status: 'ACTIVE' },
        { version: 7, status: 'RETIRED' },
        { version: 6, status: 'RETIRED' },
      ] as any);

      const result = await modelRegistryService.retireOldModels(
        TEST_ORG_ID,
        'CATEGORIZATION' as any,
        3,
      );

      expect(result.retired).toBe(5);
    });
  });

  describe('End-to-End: New Organization Cold Start', () => {
    it('should handle org with no training data (cold start)', async () => {
      prisma.aiModel.findFirst.mockResolvedValue(null);

      const model = await modelRegistryService.loadActiveModel(
        TEST_ORG_ID,
        'CATEGORIZATION' as any,
      );

      expect(model).toBeNull();

      prisma.aiTrainingData.count.mockResolvedValue(0);
      prisma.aiTrainingData.groupBy.mockResolvedValue([] as any);

      const readiness = await trainingService.validateTrainingReadiness(
        TEST_ORG_ID,
        'CATEGORIZATION' as any,
      );

      expect(readiness.isReady).toBe(false);
      expect(readiness.currentSamples).toBe(0);
      expect(readiness.warnings.length).toBeGreaterThan(0);
    });

    it('should transition from cold start to trained model after sufficient corrections', async () => {
      // Phase 1: Cold start — no model
      prisma.aiModel.findFirst.mockResolvedValueOnce(null);

      const noModel = await modelRegistryService.loadActiveModel(
        TEST_ORG_ID,
        'CATEGORIZATION' as any,
      );
      expect(noModel).toBeNull();

      // Phase 2: Accumulate corrections
      prisma.aiTrainingData.count.mockResolvedValue(50);
      prisma.aiTrainingData.groupBy.mockResolvedValue([
        { label: 'A', _count: 20 },
        { label: 'B', _count: 15 },
        { label: 'C', _count: 15 },
      ] as any);

      const readiness = await trainingService.validateTrainingReadiness(
        TEST_ORG_ID,
        'CATEGORIZATION' as any,
      );
      expect(readiness.isReady).toBe(true);

      // Phase 3: Train and save model
      prisma.aiModel.findFirst.mockResolvedValueOnce(null);
      prisma.aiModel.create.mockResolvedValue({
        id: 'first-model',
        version: 1,
        accuracy: 0.75,
        sampleCount: 50,
        status: 'ACTIVE',
        modelData: { type: 'naive-bayes' },
        trainedAt: new Date(),
      } as any);
      prisma.aiModel.updateMany.mockResolvedValue({ count: 0 });

      const saved = await modelRegistryService.saveModel(
        TEST_ORG_ID,
        'CATEGORIZATION' as any,
        { type: 'naive-bayes' },
        0.75,
        50,
      );

      expect(saved.version).toBe(1);

      // Phase 4: Verify model is now loadable
      prisma.aiModel.findFirst.mockResolvedValueOnce({
        id: 'first-model',
        version: 1,
        accuracy: 0.75,
        sampleCount: 50,
        status: 'ACTIVE',
        modelData: { type: 'naive-bayes' },
        trainedAt: new Date(),
      } as any);

      const loaded = await modelRegistryService.loadActiveModel(
        TEST_ORG_ID,
        'CATEGORIZATION' as any,
      );
      expect(loaded).toBeDefined();
      expect(loaded?.version).toBe(1);
    });
  });
});
