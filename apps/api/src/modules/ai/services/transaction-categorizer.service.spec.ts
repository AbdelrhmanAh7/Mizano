import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  TransactionCategorizerService,
  CategorizationInput,
} from './transaction-categorizer.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { AiTrainingService } from './ai-training.service';
import { AiFeedbackService } from './ai-feedback.service';
import { ModelRegistryService } from './model-registry.service';
import { createMockPrisma, MockPrismaClient } from '../../../test/mocks/prisma.mock';

describe('TransactionCategorizerService', () => {
  let service: TransactionCategorizerService;
  let prisma: MockPrismaClient;
  let trainingService: { addTrainingData: jest.Mock };
  let feedbackService: {
    storePrediction: jest.Mock;
    checkRetrainingThreshold: jest.Mock;
  };
  let modelRegistry: {
    saveModel: jest.Mock;
    loadActiveModel: jest.Mock;
  };
  let eventEmitter: { emit: jest.Mock };

  const orgId = 'org-test-001';

  beforeEach(async () => {
    prisma = createMockPrisma();
    trainingService = { addTrainingData: jest.fn().mockResolvedValue(undefined) };
    feedbackService = {
      storePrediction: jest.fn().mockResolvedValue({ id: 'pred-001' }),
      checkRetrainingThreshold: jest.fn().mockResolvedValue({ shouldRetrain: false }),
    };
    modelRegistry = {
      saveModel: jest.fn().mockResolvedValue({ id: 'model-001', version: 1 }),
      loadActiveModel: jest.fn().mockResolvedValue(null),
    };
    eventEmitter = { emit: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransactionCategorizerService,
        { provide: PrismaService, useValue: prisma },
        { provide: AiTrainingService, useValue: trainingService },
        { provide: AiFeedbackService, useValue: feedbackService },
        { provide: ModelRegistryService, useValue: modelRegistry },
        { provide: EventEmitter2, useValue: eventEmitter },
      ],
    }).compile();

    service = module.get<TransactionCategorizerService>(
      TransactionCategorizerService,
    );
  });

  describe('predict', () => {
    it('should return RULE_BASED prediction when no model is available', async () => {
      modelRegistry.loadActiveModel.mockResolvedValue(null);

      const input: CategorizationInput = {
        description: 'Office supplies purchase',
        amount: 150,
        direction: 'expense',
      };

      const result = await service.predict(orgId, input);

      expect(result).toBeDefined();
      expect(result.predictionMethod).toBe('RULE_BASED');
      expect(result.accountId).toBeNull();
      expect(result.confidence).toBe(0);
      expect(result.alternatives).toEqual([]);
    });

    it('should return ML prediction when a trained model exists', async () => {
      // First train a model by calling train()
      const trainingData = generateTrainingData(25);
      prisma.aiTrainingData.findMany.mockResolvedValue(trainingData as any);
      prisma.account.findMany.mockResolvedValue([
        { id: 'acc-office', code: '5100', name: 'Office Expenses' },
        { id: 'acc-travel', code: '5200', name: 'Travel Expenses' },
      ] as any);

      // Train the model
      await service.train(orgId);

      // Now predict
      const input: CategorizationInput = {
        description: 'Office supplies purchase',
        amount: 150,
        direction: 'expense',
      };

      const result = await service.predict(orgId, input);

      expect(result).toBeDefined();
      expect(result.predictionMethod).toBe('ML');
      expect(result.accountId).toBeDefined();
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
      expect(feedbackService.storePrediction).toHaveBeenCalled();
    });

    it('should include alternatives in prediction results', async () => {
      // Train model with varied data
      const trainingData = generateTrainingData(30);
      prisma.aiTrainingData.findMany.mockResolvedValue(trainingData as any);
      prisma.account.findMany.mockResolvedValue([
        { id: 'acc-office', code: '5100', name: 'Office Expenses' },
        { id: 'acc-travel', code: '5200', name: 'Travel Expenses' },
        { id: 'acc-utilities', code: '5300', name: 'Utilities' },
      ] as any);

      await service.train(orgId);

      const input: CategorizationInput = {
        description: 'general supplies',
        amount: 200,
        direction: 'expense',
      };

      const result = await service.predict(orgId, input);

      expect(result).toBeDefined();
      // Alternatives should not include the top prediction
      if (result.alternatives.length > 0) {
        expect(result.alternatives[0].accountId).not.toBe(result.accountId);
      }
    });
  });

  describe('train', () => {
    it('should throw BadRequestException when training data is insufficient', async () => {
      prisma.aiTrainingData.findMany.mockResolvedValue([] as any);

      await expect(service.train(orgId)).rejects.toThrow(BadRequestException);
      await expect(service.train(orgId)).rejects.toThrow('Insufficient training data');
    });

    it('should train successfully with sufficient data', async () => {
      const trainingData = generateTrainingData(25);
      prisma.aiTrainingData.findMany.mockResolvedValue(trainingData as any);

      const result = await service.train(orgId);

      expect(result).toBeDefined();
      expect(result.version).toBe(1);
      expect(result.sampleCount).toBe(25);
      expect(result.accuracy).toBeGreaterThanOrEqual(0);
      expect(result.accuracy).toBeLessThanOrEqual(1);
      expect(modelRegistry.saveModel).toHaveBeenCalledWith(
        orgId,
        'CATEGORIZATION',
        expect.any(Object),
        expect.any(Number),
        25,
      );
    });

    it('should build vendor-account map from training data', async () => {
      // Create data with consistent vendor->account mapping
      const trainingData = [];
      for (let i = 0; i < 25; i++) {
        trainingData.push({
          id: `td-${i}`,
          organizationId: orgId,
          feature: 'CATEGORIZATION',
          inputData: {
            description: 'Office supplies',
            vendorName: 'Office Depot',
            amount: 100 + i,
            direction: 'expense' as const,
          },
          label: 'acc-office',
          source: 'USER',
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }
      prisma.aiTrainingData.findMany.mockResolvedValue(trainingData as any);

      const result = await service.train(orgId);

      expect(result.sampleCount).toBe(25);
      expect(modelRegistry.saveModel).toHaveBeenCalledWith(
        orgId,
        'CATEGORIZATION',
        expect.objectContaining({
          vendorAccountMap: expect.objectContaining({
            'office depot': expect.objectContaining({
              accountId: 'acc-office',
            }),
          }),
        }),
        expect.any(Number),
        25,
      );
    });
  });

  describe('onUserCategorize', () => {
    it('should store training data from user categorization', async () => {
      const input: CategorizationInput = {
        description: 'Office rent payment',
        amount: 5000,
        direction: 'expense',
      };

      await service.onUserCategorize(
        orgId,
        input,
        'acc-rent',
        false,
      );

      expect(trainingService.addTrainingData).toHaveBeenCalledWith(
        orgId,
        'CATEGORIZATION',
        input,
        'acc-rent',
        'USER',
      );
    });

    it('should flag as correction when AI suggestion was overridden', async () => {
      const input: CategorizationInput = {
        description: 'Office rent payment',
        amount: 5000,
        direction: 'expense',
      };

      await service.onUserCategorize(
        orgId,
        input,
        'acc-rent',
        true,
        'acc-utilities', // AI suggested utilities but user chose rent
      );

      expect(trainingService.addTrainingData).toHaveBeenCalledWith(
        orgId,
        'CATEGORIZATION',
        input,
        'acc-rent',
        'CORRECTION',
      );
      expect(feedbackService.checkRetrainingThreshold).toHaveBeenCalledWith(
        orgId,
        'CATEGORIZATION',
      );
    });

    it('should emit retraining event when threshold reached', async () => {
      feedbackService.checkRetrainingThreshold.mockResolvedValue({
        shouldRetrain: true,
      });

      const input: CategorizationInput = {
        description: 'Office rent',
        amount: 5000,
        direction: 'expense',
      };

      await service.onUserCategorize(
        orgId,
        input,
        'acc-rent',
        true,
        'acc-utilities',
      );

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'ai.retraining.needed',
        expect.objectContaining({
          organizationId: orgId,
          feature: 'CATEGORIZATION',
        }),
      );
    });
  });

  describe('getStats', () => {
    it('should return zero stats when no model exists', async () => {
      modelRegistry.loadActiveModel.mockResolvedValue(null);
      prisma.aiTrainingData.count.mockResolvedValue(5 as any);

      const stats = await service.getStats(orgId);

      expect(stats.version).toBe(0);
      expect(stats.accuracy).toBe(0);
      expect(stats.sampleCount).toBe(5);
      expect(stats.lastTrainedAt).toBeNull();
    });

    it('should return model stats when model exists', async () => {
      const trainedDate = new Date('2024-06-15');
      modelRegistry.loadActiveModel.mockResolvedValue({
        id: 'model-001',
        version: 3,
        accuracy: 0.85,
        sampleCount: 150,
        trainedAt: trainedDate,
        status: 'ACTIVE',
        modelData: {},
      });

      const stats = await service.getStats(orgId);

      expect(stats.version).toBe(3);
      expect(stats.accuracy).toBe(0.85);
      expect(stats.sampleCount).toBe(150);
      expect(stats.lastTrainedAt).toBe(trainedDate.toISOString());
    });
  });

  describe('loadModel', () => {
    it('should return false when no model exists in database', async () => {
      modelRegistry.loadActiveModel.mockResolvedValue(null);

      const loaded = await service.loadModel(orgId);

      expect(loaded).toBe(false);
    });

    it('should return false when model has insufficient samples', async () => {
      modelRegistry.loadActiveModel.mockResolvedValue({
        id: 'model-001',
        version: 1,
        modelData: {
          classifierJson: '{}',
          vendorAccountMap: {},
          vocabulary: [],
          sampleCount: 5, // Below MIN_SAMPLES_FOR_PREDICTION (20)
          lastTrainedAt: new Date().toISOString(),
        },
        accuracy: 0.5,
        sampleCount: 5,
        status: 'ACTIVE',
        trainedAt: new Date(),
      });

      const loaded = await service.loadModel(orgId);

      expect(loaded).toBe(false);
    });
  });
});

// Helper to generate training data
function generateTrainingData(count: number) {
  const categories = ['acc-office', 'acc-travel', 'acc-utilities'];
  const descriptions = [
    'Office supplies purchase',
    'Flight ticket to NYC',
    'Electricity bill payment',
    'Printer paper and ink',
    'Hotel booking for conference',
    'Water utility bill',
    'Desk and chair purchase',
    'Taxi fare to airport',
    'Internet service monthly',
  ];

  return Array.from({ length: count }, (_, i) => {
    const catIndex = i % categories.length;
    const descIndex = i % descriptions.length;
    return {
      id: `td-${i}`,
      organizationId: 'org-test-001',
      feature: 'CATEGORIZATION',
      inputData: {
        description: descriptions[descIndex],
        amount: 100 + i * 10,
        direction: 'expense' as const,
      },
      label: categories[catIndex],
      source: 'USER',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  });
}
