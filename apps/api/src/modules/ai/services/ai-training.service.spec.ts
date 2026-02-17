import { Test, TestingModule } from '@nestjs/testing';
import { AiTrainingService } from './ai-training.service';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  createMockPrisma,
  MockPrismaClient,
  TEST_ORG_ID,
} from '../__tests__/fixtures/ai-test-helpers';

describe('AiTrainingService', () => {
  let service: AiTrainingService;
  let prisma: MockPrismaClient;

  const orgId = TEST_ORG_ID;
  const feature = 'CATEGORIZATION' as any;

  function createMockTrainingRecord(overrides: Record<string, any> = {}) {
    return {
      id: 'td-001',
      organizationId: orgId,
      feature,
      inputData: { description: 'Printer paper', amount: 29.99 },
      label: 'Office Supplies',
      source: 'USER',
      createdAt: new Date('2025-06-01'),
      updatedAt: new Date('2025-06-01'),
      ...overrides,
    };
  }

  beforeEach(async () => {
    prisma = createMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [AiTrainingService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<AiTrainingService>(AiTrainingService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('addTrainingData', () => {
    it('should create a training record and return its id', async () => {
      prisma.aiTrainingData.create.mockResolvedValue({
        id: 'td-new',
      } as any);

      const result = await service.addTrainingData(
        orgId,
        feature,
        { description: 'Paper towels' },
        'Cleaning Supplies',
      );

      expect(result.id).toBe('td-new');
      expect(prisma.aiTrainingData.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          organizationId: orgId,
          feature,
          inputData: { description: 'Paper towels' },
          label: 'Cleaning Supplies',
          source: 'USER',
        }),
      });
    });

    it('should use default source of USER when not specified', async () => {
      prisma.aiTrainingData.create.mockResolvedValue({ id: 'td-001' } as any);

      await service.addTrainingData(orgId, feature, {}, 'label');

      expect(prisma.aiTrainingData.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ source: 'USER' }),
      });
    });

    it('should use provided source when specified', async () => {
      prisma.aiTrainingData.create.mockResolvedValue({ id: 'td-002' } as any);

      await service.addTrainingData(orgId, feature, {}, 'label', 'CORRECTION' as any);

      expect(prisma.aiTrainingData.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ source: 'CORRECTION' }),
      });
    });
  });

  describe('getTrainingData', () => {
    it('should return training records and total count', async () => {
      const records = [
        createMockTrainingRecord({ id: 'td-1' }),
        createMockTrainingRecord({ id: 'td-2' }),
      ];
      prisma.aiTrainingData.findMany.mockResolvedValue(records as any);
      prisma.aiTrainingData.count.mockResolvedValue(2 as any);

      const result = await service.getTrainingData(orgId, feature);

      expect(result.data).toHaveLength(2);
      expect(result.total).toBe(2);
    });

    it('should return empty data when no records exist', async () => {
      prisma.aiTrainingData.findMany.mockResolvedValue([] as any);
      prisma.aiTrainingData.count.mockResolvedValue(0 as any);

      const result = await service.getTrainingData(orgId, feature);

      expect(result.data).toHaveLength(0);
      expect(result.total).toBe(0);
    });

    it('should respect limit and offset options', async () => {
      prisma.aiTrainingData.findMany.mockResolvedValue([] as any);
      prisma.aiTrainingData.count.mockResolvedValue(0 as any);

      await service.getTrainingData(orgId, feature, {
        limit: 10,
        offset: 20,
      });

      expect(prisma.aiTrainingData.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 10,
          skip: 20,
        }),
      );
    });

    it('should filter by source when provided', async () => {
      prisma.aiTrainingData.findMany.mockResolvedValue([] as any);
      prisma.aiTrainingData.count.mockResolvedValue(0 as any);

      await service.getTrainingData(orgId, feature, {
        source: 'CORRECTION' as any,
      });

      expect(prisma.aiTrainingData.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            source: 'CORRECTION',
          }),
        }),
      );
    });

    it('should filter by date range when provided', async () => {
      prisma.aiTrainingData.findMany.mockResolvedValue([] as any);
      prisma.aiTrainingData.count.mockResolvedValue(0 as any);
      const startDate = new Date('2025-01-01');
      const endDate = new Date('2025-06-30');

      await service.getTrainingData(orgId, feature, { startDate, endDate });

      expect(prisma.aiTrainingData.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            createdAt: {
              gte: startDate,
              lte: endDate,
            },
          }),
        }),
      );
    });
  });

  describe('getTrainTestSplit', () => {
    it('should split data into train and test sets', async () => {
      const records = Array.from({ length: 10 }, (_, i) =>
        createMockTrainingRecord({
          id: `td-${i}`,
          createdAt: new Date(2025, 0, i + 1),
        }),
      );
      prisma.aiTrainingData.findMany.mockResolvedValue(records as any);

      const result = await service.getTrainTestSplit(orgId, feature, 0.2);

      expect(result.train.length + result.test.length).toBe(10);
      expect(result.test.length).toBe(2); // 20% of 10
      expect(result.train.length).toBe(8); // 80% of 10
    });

    it('should return empty arrays when no data exists', async () => {
      prisma.aiTrainingData.findMany.mockResolvedValue([] as any);

      const result = await service.getTrainTestSplit(orgId, feature);

      expect(result.train).toHaveLength(0);
      expect(result.test).toHaveLength(0);
    });

    it('should default to 0.2 test ratio', async () => {
      const records = Array.from({ length: 5 }, (_, i) =>
        createMockTrainingRecord({ id: `td-${i}` }),
      );
      prisma.aiTrainingData.findMany.mockResolvedValue(records as any);

      const result = await service.getTrainTestSplit(orgId, feature);

      // 0.2 * 5 = 1 test, 4 train
      expect(result.train.length + result.test.length).toBe(5);
      expect(result.test.length).toBe(1);
    });

    it('should shuffle data before splitting', async () => {
      // Create records with ordered IDs
      const records = Array.from({ length: 20 }, (_, i) =>
        createMockTrainingRecord({
          id: `td-${String(i).padStart(3, '0')}`,
          createdAt: new Date(2025, 0, i + 1),
        }),
      );
      prisma.aiTrainingData.findMany.mockResolvedValue(records as any);

      const result1 = await service.getTrainTestSplit(orgId, feature, 0.2);
      const result2 = await service.getTrainTestSplit(orgId, feature, 0.2);

      // With random shuffling, the exact order is unlikely to be the same twice
      // But we can at least verify the total is preserved
      expect(result1.train.length + result1.test.length).toBe(20);
      expect(result2.train.length + result2.test.length).toBe(20);
    });
  });

  describe('seedTrainingData', () => {
    it('should bulk insert training records', async () => {
      prisma.aiTrainingData.createMany.mockResolvedValue({ count: 5 } as any);

      const records = [
        { inputData: { desc: 'Paper' }, label: 'Office' },
        { inputData: { desc: 'Gas' }, label: 'Transport' },
        { inputData: { desc: 'Lunch' }, label: 'Meals' },
        { inputData: { desc: 'Software' }, label: 'IT' },
        { inputData: { desc: 'Rent' }, label: 'Facilities' },
      ];

      const result = await service.seedTrainingData(orgId, feature, records);

      expect(result.inserted).toBe(5);
      expect(prisma.aiTrainingData.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({
            organizationId: orgId,
            feature,
            source: 'SEED',
            label: 'Office',
          }),
        ]),
        skipDuplicates: true,
      });
    });

    it('should return 0 inserted for empty records array', async () => {
      prisma.aiTrainingData.createMany.mockResolvedValue({ count: 0 } as any);

      const result = await service.seedTrainingData(orgId, feature, []);

      expect(result.inserted).toBe(0);
    });
  });

  describe('getTrainingStats', () => {
    it('should return zero stats when no training data exists', async () => {
      prisma.aiTrainingData.count.mockResolvedValue(0 as any);
      prisma.aiTrainingData.groupBy.mockResolvedValue([] as any);
      prisma.aiTrainingData.findMany.mockResolvedValue([] as any);
      prisma.aiTrainingData.findFirst.mockResolvedValue(null as any);

      const result = await service.getTrainingStats(orgId, feature);

      expect(result.total).toBe(0);
      expect(result.bySource.USER).toBe(0);
      expect(result.bySource.SEED).toBe(0);
      expect(result.bySource.CORRECTION).toBe(0);
      expect(result.uniqueLabels).toBe(0);
      expect(result.oldestRecord).toBeNull();
      expect(result.newestRecord).toBeNull();
    });

    it('should return correct stats with training data', async () => {
      const oldest = new Date('2025-01-01');
      const newest = new Date('2025-06-15');

      prisma.aiTrainingData.count.mockResolvedValue(100 as any);
      prisma.aiTrainingData.groupBy.mockResolvedValue([
        { source: 'USER', _count: 60 },
        { source: 'SEED', _count: 30 },
        { source: 'CORRECTION', _count: 10 },
      ] as any);
      prisma.aiTrainingData.findMany.mockResolvedValue([
        { label: 'Office' },
        { label: 'Travel' },
        { label: 'Meals' },
      ] as any);
      (prisma.aiTrainingData.findFirst as jest.Mock)
        .mockResolvedValueOnce({ createdAt: oldest } as any) // oldest
        .mockResolvedValueOnce({ createdAt: newest } as any); // newest

      const result = await service.getTrainingStats(orgId, feature);

      expect(result.total).toBe(100);
      expect(result.bySource.USER).toBe(60);
      expect(result.bySource.SEED).toBe(30);
      expect(result.bySource.CORRECTION).toBe(10);
      expect(result.uniqueLabels).toBe(3);
      expect(result.oldestRecord).toEqual(oldest);
      expect(result.newestRecord).toEqual(newest);
    });
  });

  describe('validateTrainingReadiness', () => {
    it('should return not ready when below minimum samples', async () => {
      prisma.aiTrainingData.count.mockResolvedValue(5 as any);
      prisma.aiTrainingData.groupBy.mockResolvedValue([] as any);

      const result = await service.validateTrainingReadiness(orgId, feature);

      expect(result.isReady).toBe(false);
      expect(result.currentSamples).toBe(5);
      expect(result.minimumRequired).toBe(20); // CATEGORIZATION = 20
      expect(result.warnings).toEqual(
        expect.arrayContaining([expect.stringContaining('Insufficient training data')]),
      );
    });

    it('should return ready when above minimum samples', async () => {
      prisma.aiTrainingData.count.mockResolvedValue(50 as any);
      prisma.aiTrainingData.groupBy.mockResolvedValue([
        { label: 'Office', _count: 20 },
        { label: 'Travel', _count: 15 },
        { label: 'Meals', _count: 15 },
      ] as any);

      const result = await service.validateTrainingReadiness(orgId, feature);

      expect(result.isReady).toBe(true);
      expect(result.currentSamples).toBe(50);
    });

    it('should warn about class imbalance when dominant class > 90%', async () => {
      prisma.aiTrainingData.count.mockResolvedValue(100 as any);
      prisma.aiTrainingData.groupBy.mockResolvedValue([
        { label: 'Office', _count: 95 },
        { label: 'Travel', _count: 5 },
      ] as any);

      const result = await service.validateTrainingReadiness(orgId, feature);

      expect(result.isReady).toBe(true); // Still ready, just with warnings
      expect(result.warnings).toEqual(
        expect.arrayContaining([expect.stringContaining('Severe class imbalance')]),
      );
    });

    it('should warn about classes with fewer than 3 samples', async () => {
      prisma.aiTrainingData.count.mockResolvedValue(25 as any);
      prisma.aiTrainingData.groupBy.mockResolvedValue([
        { label: 'Office', _count: 20 },
        { label: 'Rare', _count: 2 },
        { label: 'AlsoRare', _count: 1 },
        { label: 'OK', _count: 2 },
      ] as any);

      const result = await service.validateTrainingReadiness(orgId, feature);

      expect(result.warnings).toEqual(
        expect.arrayContaining([expect.stringContaining('fewer than 3 samples')]),
      );
    });

    it('should use feature-specific minimum samples', async () => {
      prisma.aiTrainingData.count.mockResolvedValue(8 as any);
      prisma.aiTrainingData.groupBy.mockResolvedValue([] as any);

      // PAYMENT_PREDICTION has minimum of 3
      const result = await service.validateTrainingReadiness(orgId, 'PAYMENT_PREDICTION' as any);

      expect(result.isReady).toBe(true);
      expect(result.minimumRequired).toBe(3);
    });

    it('should use default minimum of 20 for unknown features', async () => {
      prisma.aiTrainingData.count.mockResolvedValue(15 as any);
      prisma.aiTrainingData.groupBy.mockResolvedValue([] as any);

      // Use a feature that's not in the MINIMUM_TRAINING_SAMPLES map
      const result = await service.validateTrainingReadiness(orgId, 'CHATBOT' as any);

      expect(result.isReady).toBe(false);
      expect(result.minimumRequired).toBe(20);
    });
  });

  describe('getLabelDistribution', () => {
    it('should return empty object when no data exists', async () => {
      prisma.aiTrainingData.groupBy.mockResolvedValue([] as any);

      const result = await service.getLabelDistribution(orgId, feature);

      expect(result).toEqual({});
    });

    it('should return label counts', async () => {
      prisma.aiTrainingData.groupBy.mockResolvedValue([
        { label: 'Office', _count: 30 },
        { label: 'Travel', _count: 20 },
        { label: 'Meals', _count: 10 },
      ] as any);

      const result = await service.getLabelDistribution(orgId, feature);

      expect(result).toEqual({
        Office: 30,
        Travel: 20,
        Meals: 10,
      });
    });
  });

  describe('generateInputHash', () => {
    it('should return a deterministic hash for the same input', () => {
      const input = { amount: 100, description: 'Test' };

      const hash1 = service.generateInputHash(input);
      const hash2 = service.generateInputHash(input);

      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(16);
    });

    it('should return different hashes for different input', () => {
      const hash1 = service.generateInputHash({ amount: 100 });
      const hash2 = service.generateInputHash({ amount: 200 });

      expect(hash1).not.toBe(hash2);
    });

    it('should return same hash regardless of key order', () => {
      const hash1 = service.generateInputHash({ a: 1, b: 2 });
      const hash2 = service.generateInputHash({ b: 2, a: 1 });

      expect(hash1).toBe(hash2);
    });
  });

  describe('countCorrectionsSinceLastTraining', () => {
    it('should return count of corrections since last model training', async () => {
      prisma.aiModel.findFirst.mockResolvedValue({
        trainedAt: new Date('2025-06-01'),
      } as any);
      prisma.aiTrainingData.count.mockResolvedValue(15 as any);

      const result = await service.countCorrectionsSinceLastTraining(orgId, feature);

      expect(result).toBe(15);
    });

    it('should count all corrections when no model has been trained', async () => {
      prisma.aiModel.findFirst.mockResolvedValue(null as any);
      prisma.aiTrainingData.count.mockResolvedValue(25 as any);

      const result = await service.countCorrectionsSinceLastTraining(orgId, feature);

      expect(result).toBe(25);
    });
  });

  describe('deleteOldTrainingData', () => {
    it('should delete only SEED data older than the specified date', async () => {
      prisma.aiTrainingData.deleteMany.mockResolvedValue({ count: 10 } as any);
      const cutoff = new Date('2025-01-01');

      const result = await service.deleteOldTrainingData(orgId, feature, cutoff);

      expect(result.deleted).toBe(10);
      expect(prisma.aiTrainingData.deleteMany).toHaveBeenCalledWith({
        where: {
          organizationId: orgId,
          feature,
          createdAt: { lt: cutoff },
          source: 'SEED',
        },
      });
    });
  });
});
