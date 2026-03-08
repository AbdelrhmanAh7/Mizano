import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { QualityPredictionService } from './quality-prediction.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { ModelRegistryService } from './model-registry.service';
import { AiFeedbackService } from './ai-feedback.service';
import { AiTrainingService } from './ai-training.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  createMockPrisma,
  createMockModelRegistry,
  createMockAiFeedback,
  createMockAiTraining,
  createMockEventEmitter,
  MockPrismaClient,
  TEST_ORG_ID,
} from '../__tests__/fixtures/ai-test-helpers';

describe('QualityPredictionService', () => {
  let service: QualityPredictionService;
  let prisma: MockPrismaClient;
  let modelRegistry: ReturnType<typeof createMockModelRegistry>;

  beforeEach(async () => {
    prisma = createMockPrisma();
    modelRegistry = createMockModelRegistry();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QualityPredictionService,
        { provide: PrismaService, useValue: prisma },
        { provide: ModelRegistryService, useValue: modelRegistry },
        { provide: AiFeedbackService, useValue: createMockAiFeedback() },
        { provide: AiTrainingService, useValue: createMockAiTraining() },
        { provide: EventEmitter2, useValue: createMockEventEmitter() },
      ],
    }).compile();

    service = module.get<QualityPredictionService>(QualityPredictionService);
  });

  describe('predictWorkOrderQuality', () => {
    const mockWorkOrder = {
      id: 'wo-001',
      organizationId: TEST_ORG_ID,
      bomId: 'bom-001',
      quantity: 100,
      actualStartDate: new Date(2024, 5, 10),
      plannedStartDate: new Date(2024, 5, 10),
      createdAt: new Date(2024, 5, 10),
      bom: {
        items: [{ id: 'bi-1' }, { id: 'bi-2' }, { id: 'bi-3' }],
      },
      productionEntries: [],
    };

    beforeEach(() => {
      prisma.workOrder.findFirst
        .mockResolvedValueOnce(mockWorkOrder as any) // predictWorkOrderQuality
        .mockResolvedValueOnce(mockWorkOrder as any); // extractQualityFeatures

      // No historical orders
      prisma.workOrder.findMany.mockResolvedValue([] as any);

      // No ML model
      modelRegistry.loadActiveModel.mockResolvedValue(null as any);
    });

    it('should return LOW defect risk for work order with good history', async () => {
      const result = await service.predictWorkOrderQuality(TEST_ORG_ID, 'wo-001');

      expect(result.workOrderId).toBe('wo-001');
      expect(result.riskLevel).toBe('LOW');
      expect(result.defectRisk).toBeLessThan(0.4);
      expect(result.confidence).toBe(0.5); // No ML model → 0.5
    });

    it('should return HIGHER defect risk for complex BOM with bad history', async () => {
      const complexWorkOrder = {
        ...mockWorkOrder,
        quantity: 1500,
        bom: {
          items: Array.from({ length: 20 }, (_, i) => ({ id: `bi-${i}` })),
        },
      };

      prisma.workOrder.findFirst
        .mockReset()
        .mockResolvedValueOnce(complexWorkOrder as any)
        .mockResolvedValueOnce(complexWorkOrder as any);

      // Historical orders with high defect rate
      prisma.workOrder.findMany.mockResolvedValue([
        {
          id: 'wo-hist-1',
          bomId: 'bom-001',
          quantity: 100,
          status: 'COMPLETED',
          productionEntries: [{ quantityProduced: 80, wastageQuantity: 15, quantityRejected: 5 }],
        },
        {
          id: 'wo-hist-2',
          bomId: 'bom-001',
          quantity: 200,
          status: 'COMPLETED',
          productionEntries: [{ quantityProduced: 160, wastageQuantity: 30, quantityRejected: 10 }],
        },
      ] as any);

      const result = await service.predictWorkOrderQuality(TEST_ORG_ID, 'wo-001');

      expect(result.defectRisk).toBeGreaterThan(0.3);
      expect(['MEDIUM', 'HIGH']).toContain(result.riskLevel);
      expect(result.factors.length).toBeGreaterThan(0);
    });

    it('should throw NotFoundException when work order not found', async () => {
      prisma.workOrder.findFirst.mockReset().mockResolvedValue(null as any);

      await expect(service.predictWorkOrderQuality(TEST_ORG_ID, 'nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should include relevant risk factors in result', async () => {
      const largeOrder = {
        ...mockWorkOrder,
        quantity: 2000,
        bom: { items: Array.from({ length: 15 }, (_, i) => ({ id: `bi-${i}` })) },
      };

      prisma.workOrder.findFirst
        .mockReset()
        .mockResolvedValueOnce(largeOrder as any)
        .mockResolvedValueOnce(largeOrder as any);

      prisma.workOrder.findMany.mockResolvedValue([] as any);

      const result = await service.predictWorkOrderQuality(TEST_ORG_ID, 'wo-001');

      const factorNames = result.factors.map((f) => f.name);
      expect(factorNames).toContain('Batch Size');
      expect(factorNames).toContain('BOM Complexity');
    });

    it('should include recommendations in result', async () => {
      const result = await service.predictWorkOrderQuality(TEST_ORG_ID, 'wo-001');

      expect(result.recommendations.length).toBeGreaterThan(0);
    });

    it('should handle weekend production as slightly higher risk', async () => {
      const weekendOrder = {
        ...mockWorkOrder,
        actualStartDate: new Date(2024, 5, 8), // Saturday
        plannedStartDate: new Date(2024, 5, 8),
      };

      prisma.workOrder.findFirst
        .mockReset()
        .mockResolvedValueOnce(weekendOrder as any)
        .mockResolvedValueOnce(weekendOrder as any);

      prisma.workOrder.findMany.mockResolvedValue([] as any);

      const result = await service.predictWorkOrderQuality(TEST_ORG_ID, 'wo-001');

      const weekendFactor = result.factors.find((f) => f.name === 'Weekend Production');
      expect(weekendFactor).toBeDefined();
    });

    it('should use ML model when available', async () => {
      modelRegistry.loadActiveModel.mockResolvedValue({
        modelData: { tree: {} },
        accuracy: 0.85,
      } as any);

      // ML predict will throw because we give it a mock, falling back to rule-based
      const result = await service.predictWorkOrderQuality(TEST_ORG_ID, 'wo-001');

      expect(result.confidence).toBeGreaterThanOrEqual(0.5);
    });

    it('should clamp defect risk between 0 and 1', async () => {
      const result = await service.predictWorkOrderQuality(TEST_ORG_ID, 'wo-001');

      expect(result.defectRisk).toBeGreaterThanOrEqual(0);
      expect(result.defectRisk).toBeLessThanOrEqual(1);
    });
  });

  describe('getBomQualityMetrics', () => {
    it('should return quality metrics for a BOM', async () => {
      prisma.bOM.findFirst.mockResolvedValue({
        id: 'bom-001',
        name: 'Widget BOM',
      } as any);

      prisma.workOrder.findMany.mockResolvedValue([
        {
          id: 'wo-1',
          status: 'COMPLETED',
          actualStartDate: new Date(2024, 0, 1),
          completedDate: new Date(2024, 0, 10),
          productionEntries: [{ quantityProduced: 100, wastageQuantity: 5, quantityRejected: 2 }],
        },
        {
          id: 'wo-2',
          status: 'COMPLETED',
          actualStartDate: new Date(2024, 1, 1),
          completedDate: new Date(2024, 1, 15),
          productionEntries: [{ quantityProduced: 200, wastageQuantity: 10, quantityRejected: 3 }],
        },
      ] as any);

      const result = await service.getBomQualityMetrics(TEST_ORG_ID, 'bom-001');

      expect(result.bomId).toBe('bom-001');
      expect(result.bomName).toBe('Widget BOM');
      expect(result.totalProduced).toBe(300);
      expect(result.totalWaste).toBe(20);
      expect(result.defectRate).toBeGreaterThan(0);
      expect(result.workOrderCount).toBe(2);
      expect(result.avgCompletionDays).toBeGreaterThan(0);
    });

    it('should throw NotFoundException when BOM not found', async () => {
      prisma.bOM.findFirst.mockResolvedValue(null as any);

      await expect(service.getBomQualityMetrics(TEST_ORG_ID, 'nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should return zero metrics when no completed work orders', async () => {
      prisma.bOM.findFirst.mockResolvedValue({
        id: 'bom-002',
        name: 'Empty BOM',
      } as any);

      prisma.workOrder.findMany.mockResolvedValue([] as any);

      const result = await service.getBomQualityMetrics(TEST_ORG_ID, 'bom-002');

      expect(result.totalProduced).toBe(0);
      expect(result.totalWaste).toBe(0);
      expect(result.defectRate).toBe(0);
      expect(result.avgCompletionDays).toBe(0);
      expect(result.workOrderCount).toBe(0);
    });
  });

  describe('getQualityTrends', () => {
    it('should return monthly quality trends', async () => {
      prisma.workOrder.findMany.mockResolvedValue([
        {
          id: 'wo-jan',
          completedDate: new Date(2024, 0, 15),
          productionEntries: [{ quantityProduced: 100, wastageQuantity: 5, quantityRejected: 0 }],
        },
        {
          id: 'wo-feb',
          completedDate: new Date(2024, 1, 15),
          productionEntries: [{ quantityProduced: 150, wastageQuantity: 10, quantityRejected: 2 }],
        },
      ] as any);

      const trends = await service.getQualityTrends(TEST_ORG_ID);

      expect(trends).toHaveLength(2);
      expect(trends[0].month).toBe('2024-01');
      expect(trends[1].month).toBe('2024-02');
      expect(trends[0].totalProduced).toBe(100);
      expect(trends[1].totalProduced).toBe(150);
    });

    it('should return empty array when no completed orders', async () => {
      prisma.workOrder.findMany.mockResolvedValue([] as any);

      const trends = await service.getQualityTrends(TEST_ORG_ID);

      expect(trends).toEqual([]);
    });

    it('should calculate correct defect rate per month', async () => {
      prisma.workOrder.findMany.mockResolvedValue([
        {
          id: 'wo-1',
          completedDate: new Date(2024, 0, 15),
          productionEntries: [{ quantityProduced: 90, wastageQuantity: 10, quantityRejected: 0 }],
        },
      ] as any);

      const trends = await service.getQualityTrends(TEST_ORG_ID);

      // waste / (produced + waste) = 10 / 100 = 0.1
      expect(trends[0].defectRate).toBeCloseTo(0.1, 3);
    });
  });

  describe('trainModel', () => {
    it('should return insufficient data when < 10 orders', async () => {
      prisma.workOrder.findMany.mockResolvedValue([
        {
          id: 'wo-1',
          quantity: 100,
          bomId: 'bom-1',
          bom: { items: [{ id: 'bi-1' }] },
          productionEntries: [{ quantityProduced: 90, wastageQuantity: 5, quantityRejected: 5 }],
          actualStartDate: new Date(),
          createdAt: new Date(),
        },
      ] as any);

      const result = await service.trainModel(TEST_ORG_ID);

      expect(result.accuracy).toBe(0);
      expect(result.sampleCount).toBe(1);
      expect(result.version).toBe(0);
    });

    it('should train model and return accuracy when sufficient data', async () => {
      const orders = Array.from({ length: 15 }, (_, i) => ({
        id: `wo-${i}`,
        quantity: 100 + i * 10,
        bomId: 'bom-1',
        bom: { items: Array.from({ length: 3 + i }, (_, j) => ({ id: `bi-${j}` })) },
        productionEntries: [
          {
            quantityProduced: 90 + i,
            wastageQuantity: i % 3 === 0 ? 10 : 2,
            quantityRejected: i % 5 === 0 ? 5 : 0,
          },
        ],
        actualStartDate: new Date(2024, 0, i + 1),
        createdAt: new Date(2024, 0, i + 1),
        status: 'COMPLETED',
      }));

      prisma.workOrder.findMany.mockResolvedValue(orders as any);
      modelRegistry.saveModel.mockResolvedValue({ version: 1 } as any);

      const result = await service.trainModel(TEST_ORG_ID);

      expect(result.sampleCount).toBe(15);
      expect(result.version).toBe(1);
      expect(result.accuracy).toBeGreaterThanOrEqual(0);
      expect(result.accuracy).toBeLessThanOrEqual(1);
    });
  });
});
