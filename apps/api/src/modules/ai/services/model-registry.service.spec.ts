import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ModelRegistryService } from './model-registry.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  createMockPrisma,
  MockPrismaClient,
  createMockEventEmitter,
  TEST_ORG_ID,
  mockDecimal,
} from '../__tests__/fixtures/ai-test-helpers';

describe('ModelRegistryService', () => {
  let service: ModelRegistryService;
  let prisma: MockPrismaClient;
  let eventEmitter: ReturnType<typeof createMockEventEmitter>;

  const orgId = TEST_ORG_ID;
  const feature = 'CATEGORIZATION' as any;

  function createMockModel(overrides: Record<string, any> = {}) {
    return {
      id: 'model-001',
      organizationId: orgId,
      feature,
      version: 1,
      modelData: { weights: [0.1, 0.2] },
      accuracy: mockDecimal(0.85),
      sampleCount: 100,
      status: 'ACTIVE',
      trainedAt: new Date('2025-01-15'),
      createdAt: new Date('2025-01-15'),
      updatedAt: new Date('2025-01-15'),
      ...overrides,
    };
  }

  beforeEach(async () => {
    prisma = createMockPrisma();
    eventEmitter = createMockEventEmitter();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ModelRegistryService,
        { provide: PrismaService, useValue: prisma },
        { provide: EventEmitter2, useValue: eventEmitter },
      ],
    }).compile();

    service = module.get<ModelRegistryService>(ModelRegistryService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('saveModel', () => {
    it('should save a new model and return id and version', async () => {
      prisma.aiModel.findFirst.mockResolvedValue(null as any);
      prisma.aiModel.updateMany.mockResolvedValue({ count: 0 } as any);
      prisma.aiModel.create.mockResolvedValue(
        createMockModel({ id: 'model-new', version: 1 }) as any,
      );

      const result = await service.saveModel(orgId, feature, { weights: [0.5] }, 0.9, 200);

      expect(result).toBeDefined();
      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('version');
    });

    it('should emit ai.model.activated event after saving', async () => {
      prisma.aiModel.findFirst.mockResolvedValue(null as any);
      prisma.aiModel.updateMany.mockResolvedValue({ count: 0 } as any);
      prisma.aiModel.create.mockResolvedValue(
        createMockModel({ id: 'model-new', version: 1 }) as any,
      );

      await service.saveModel(orgId, feature, { weights: [0.5] }, 0.9, 200);

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'ai.model.activated',
        expect.objectContaining({
          organizationId: orgId,
          feature,
        }),
      );
    });

    it('should increment version from last model', async () => {
      // The $transaction mock calls the callback with the prisma mock itself
      // Inside the transaction, findFirst returns a model with version 3
      prisma.aiModel.findFirst.mockResolvedValue(createMockModel({ version: 3 }) as any);
      prisma.aiModel.updateMany.mockResolvedValue({ count: 1 } as any);
      prisma.aiModel.create.mockResolvedValue(
        createMockModel({ id: 'model-new', version: 4 }) as any,
      );

      const result = await service.saveModel(orgId, feature, { weights: [0.5] }, 0.9, 200);

      expect(result.version).toBe(4);
    });

    it('should start at version 1 when no previous model exists', async () => {
      prisma.aiModel.findFirst.mockResolvedValue(null as any);
      prisma.aiModel.updateMany.mockResolvedValue({ count: 0 } as any);
      prisma.aiModel.create.mockResolvedValue(
        createMockModel({ id: 'model-new', version: 1 }) as any,
      );

      const result = await service.saveModel(orgId, feature, { weights: [0.5] }, 0.9, 200);

      expect(result.version).toBe(1);
    });
  });

  describe('loadActiveModel', () => {
    it('should return null when no active model exists', async () => {
      prisma.aiModel.findFirst.mockResolvedValue(null as any);

      const result = await service.loadActiveModel(orgId, feature);

      expect(result).toBeNull();
    });

    it('should return the active model with numeric accuracy', async () => {
      const model = createMockModel();
      prisma.aiModel.findFirst.mockResolvedValue(model as any);

      const result = await service.loadActiveModel(orgId, feature);

      expect(result).toBeDefined();
      expect(result!.id).toBe('model-001');
      expect(result!.version).toBe(1);
      expect(typeof result!.accuracy).toBe('number');
      expect(result!.accuracy).toBe(0.85);
      expect(result!.sampleCount).toBe(100);
      expect(result!.status).toBe('ACTIVE');
    });

    it('should return the latest active model by version', async () => {
      const model = createMockModel({ version: 5 });
      prisma.aiModel.findFirst.mockResolvedValue(model as any);

      const result = await service.loadActiveModel(orgId, feature);

      expect(result!.version).toBe(5);
    });
  });

  describe('getModelStatus', () => {
    it('should return no active model status when none exists', async () => {
      prisma.aiModel.findFirst.mockResolvedValue(null as any);

      const result = await service.getModelStatus(orgId, feature);

      expect(result.hasActiveModel).toBe(false);
      expect(result.activeVersion).toBeNull();
      expect(result.isTraining).toBe(false);
      expect(result.trainingVersion).toBeNull();
      expect(result.lastTrainedAt).toBeNull();
    });

    it('should return active model status when one exists', async () => {
      const trainedAt = new Date('2025-06-01');
      // getModelStatus calls findFirst twice in Promise.all
      // First for active, second for training
      (prisma.aiModel.findFirst as jest.Mock)
        .mockResolvedValueOnce({ version: 3, trainedAt } as any)
        .mockResolvedValueOnce(null as any);

      const result = await service.getModelStatus(orgId, feature);

      expect(result.hasActiveModel).toBe(true);
      expect(result.activeVersion).toBe(3);
      expect(result.isTraining).toBe(false);
      expect(result.lastTrainedAt).toEqual(trainedAt);
    });

    it('should detect when a model is in training', async () => {
      (prisma.aiModel.findFirst as jest.Mock)
        .mockResolvedValueOnce(null as any) // no active
        .mockResolvedValueOnce({ version: 4 } as any); // training

      const result = await service.getModelStatus(orgId, feature);

      expect(result.hasActiveModel).toBe(false);
      expect(result.isTraining).toBe(true);
      expect(result.trainingVersion).toBe(4);
    });
  });

  describe('getAccuracyTrend', () => {
    it('should return stable trend with empty history when no models exist', async () => {
      prisma.aiModel.findMany.mockResolvedValue([] as any);

      const result = await service.getAccuracyTrend(orgId, feature);

      expect(result.trend).toBe('stable');
      expect(result.history).toHaveLength(0);
      expect(result.currentAccuracy).toBeNull();
      expect(result.avgAccuracy).toBe(0);
      expect(result.degradationDetected).toBe(false);
    });

    it('should calculate current and average accuracy from history', async () => {
      const models = [
        { version: 3, accuracy: mockDecimal(0.9), trainedAt: new Date() },
        { version: 2, accuracy: mockDecimal(0.85), trainedAt: new Date() },
        { version: 1, accuracy: mockDecimal(0.8), trainedAt: new Date() },
      ];
      prisma.aiModel.findMany.mockResolvedValue(models as any);

      const result = await service.getAccuracyTrend(orgId, feature);

      expect(result.currentAccuracy).toBe(0.9);
      expect(result.avgAccuracy).toBeCloseTo(0.85, 2);
      expect(result.history).toHaveLength(3);
    });

    it('should detect improving trend when recent accuracy is higher', async () => {
      // Need >= 4 models for trend detection. Most recent first.
      const models = [
        { version: 6, accuracy: mockDecimal(0.95), trainedAt: new Date() },
        { version: 5, accuracy: mockDecimal(0.93), trainedAt: new Date() },
        { version: 4, accuracy: mockDecimal(0.92), trainedAt: new Date() },
        { version: 3, accuracy: mockDecimal(0.8), trainedAt: new Date() },
        { version: 2, accuracy: mockDecimal(0.78), trainedAt: new Date() },
        { version: 1, accuracy: mockDecimal(0.75), trainedAt: new Date() },
      ];
      prisma.aiModel.findMany.mockResolvedValue(models as any);

      const result = await service.getAccuracyTrend(orgId, feature);

      expect(result.trend).toBe('improving');
    });

    it('should detect degradation when recent accuracy drops significantly', async () => {
      const models = [
        { version: 6, accuracy: mockDecimal(0.6), trainedAt: new Date() },
        { version: 5, accuracy: mockDecimal(0.62), trainedAt: new Date() },
        { version: 4, accuracy: mockDecimal(0.65), trainedAt: new Date() },
        { version: 3, accuracy: mockDecimal(0.9), trainedAt: new Date() },
        { version: 2, accuracy: mockDecimal(0.88), trainedAt: new Date() },
        { version: 1, accuracy: mockDecimal(0.85), trainedAt: new Date() },
      ];
      prisma.aiModel.findMany.mockResolvedValue(models as any);

      const result = await service.getAccuracyTrend(orgId, feature);

      expect(result.trend).toBe('degrading');
      expect(result.degradationDetected).toBe(true);
    });

    it('should flag degradation when current accuracy is well below average', async () => {
      const models = [
        { version: 3, accuracy: mockDecimal(0.5), trainedAt: new Date() },
        { version: 2, accuracy: mockDecimal(0.85), trainedAt: new Date() },
        { version: 1, accuracy: mockDecimal(0.9), trainedAt: new Date() },
      ];
      prisma.aiModel.findMany.mockResolvedValue(models as any);

      const result = await service.getAccuracyTrend(orgId, feature);

      expect(result.degradationDetected).toBe(true);
    });
  });

  describe('deleteAllModels', () => {
    it('should delete all models for a feature and return count', async () => {
      prisma.aiModel.deleteMany.mockResolvedValue({ count: 5 } as any);

      const result = await service.deleteAllModels(orgId, feature);

      expect(result.deleted).toBe(5);
      expect(prisma.aiModel.deleteMany).toHaveBeenCalledWith({
        where: { organizationId: orgId, feature },
      });
    });

    it('should return 0 when no models exist to delete', async () => {
      prisma.aiModel.deleteMany.mockResolvedValue({ count: 0 } as any);

      const result = await service.deleteAllModels(orgId, feature);

      expect(result.deleted).toBe(0);
    });
  });

  describe('retireOldModels', () => {
    it('should retire models beyond the keep count', async () => {
      prisma.aiModel.findMany.mockResolvedValue([
        { version: 5 },
        { version: 4 },
        { version: 3 },
      ] as any);
      prisma.aiModel.updateMany.mockResolvedValue({ count: 2 } as any);

      const result = await service.retireOldModels(orgId, feature, 3);

      expect(result.retired).toBe(2);
      expect(prisma.aiModel.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            version: { notIn: [5, 4, 3] },
          }),
          data: { status: 'RETIRED' },
        }),
      );
    });

    it('should return 0 retired when all models are within keep range', async () => {
      prisma.aiModel.findMany.mockResolvedValue([{ version: 2 }, { version: 1 }] as any);
      prisma.aiModel.updateMany.mockResolvedValue({ count: 0 } as any);

      const result = await service.retireOldModels(orgId, feature, 3);

      expect(result.retired).toBe(0);
    });

    it('should default to keeping 3 versions', async () => {
      prisma.aiModel.findMany.mockResolvedValue([
        { version: 5 },
        { version: 4 },
        { version: 3 },
      ] as any);
      prisma.aiModel.updateMany.mockResolvedValue({ count: 0 } as any);

      await service.retireOldModels(orgId, feature);

      expect(prisma.aiModel.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 3 }));
    });
  });

  describe('activateModel', () => {
    it('should throw NotFoundException when model version does not exist', async () => {
      prisma.aiModel.findUnique.mockResolvedValue(null as any);

      await expect(service.activateModel(orgId, feature, 99)).rejects.toThrow(NotFoundException);
    });

    it('should activate the specified model and emit event', async () => {
      prisma.aiModel.findUnique.mockResolvedValue(createMockModel({ version: 2 }) as any);
      prisma.aiModel.updateMany.mockResolvedValue({ count: 1 } as any);
      prisma.aiModel.update.mockResolvedValue(
        createMockModel({ version: 2, status: 'ACTIVE' }) as any,
      );

      await service.activateModel(orgId, feature, 2);

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'ai.model.activated',
        expect.objectContaining({ version: 2 }),
      );
    });
  });

  describe('saveModelWithValidation', () => {
    it('should promote model when no previous model exists', async () => {
      prisma.aiModel.findFirst.mockResolvedValue(null as any);
      prisma.aiModel.updateMany.mockResolvedValue({ count: 0 } as any);
      prisma.aiModel.create.mockResolvedValue(
        createMockModel({ id: 'new-model', version: 1 }) as any,
      );

      const result = await service.saveModelWithValidation(
        orgId,
        feature,
        { weights: [] },
        0.8,
        100,
      );

      expect(result.promoted).toBe(true);
    });

    it('should NOT promote model when accuracy regresses beyond tolerance', async () => {
      // loadActiveModel returns a model with 0.90 accuracy
      prisma.aiModel.findFirst.mockResolvedValue(
        createMockModel({ accuracy: mockDecimal(0.9) }) as any,
      );
      prisma.aiModel.create.mockResolvedValue(
        createMockModel({ id: 'new-model', version: 2, status: 'RETIRED' }) as any,
      );

      const result = await service.saveModelWithValidation(
        orgId,
        feature,
        { weights: [] },
        0.8, // below 0.90 - 0.05 tolerance
        100,
      );

      expect(result.promoted).toBe(false);
      expect(result.reason).toBe('accuracy_regression');
    });

    it('should promote model when forceActivate is true even with regression', async () => {
      prisma.aiModel.findFirst.mockResolvedValue(
        createMockModel({ accuracy: mockDecimal(0.9) }) as any,
      );
      prisma.aiModel.updateMany.mockResolvedValue({ count: 1 } as any);
      prisma.aiModel.create.mockResolvedValue(
        createMockModel({ id: 'new-model', version: 2 }) as any,
      );

      const result = await service.saveModelWithValidation(
        orgId,
        feature,
        { weights: [] },
        0.7,
        100,
        { forceActivate: true },
      );

      expect(result.promoted).toBe(true);
    });
  });

  describe('rollbackModel', () => {
    it('should rollback to a specific version when provided', async () => {
      prisma.aiModel.findUnique.mockResolvedValue(createMockModel({ version: 2 }) as any);
      prisma.aiModel.updateMany.mockResolvedValue({ count: 1 } as any);
      prisma.aiModel.update.mockResolvedValue(createMockModel({ version: 2 }) as any);

      const result = await service.rollbackModel(orgId, feature, 2);

      expect(result.version).toBe(2);
    });

    it('should throw NotFoundException when no retired model exists for auto-rollback', async () => {
      prisma.aiModel.findFirst.mockResolvedValue(null as any);

      await expect(service.rollbackModel(orgId, feature)).rejects.toThrow(NotFoundException);
    });
  });
});
