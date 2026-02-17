import { Test, TestingModule } from '@nestjs/testing';
import { ChurnPredictionService } from './churn-prediction.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { ModelRegistryService } from './model-registry.service';
import { createMockPrisma, MockPrismaClient } from '../../../test/mocks/prisma.mock';
import { AiFeedbackService } from './ai-feedback.service';
import { AiTrainingService } from './ai-training.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Decimal } from '@prisma/client/runtime/library';

describe('ChurnPredictionService', () => {
  let service: ChurnPredictionService;
  let prisma: MockPrismaClient;
  let modelRegistry: {
    loadActiveModel: jest.Mock;
    saveModel: jest.Mock;
  };

  const orgId = 'org-test-001';

  function createMockCustomer(overrides: Record<string, any> = {}) {
    return {
      id: 'cust-001',
      organizationId: orgId,
      name: 'Test Customer',
      email: 'test@customer.com',
      deletedAt: null,
      createdAt: new Date('2023-01-01'),
      updatedAt: new Date(),
      ...overrides,
    };
  }

  function createMockInvoice(overrides: Record<string, any> = {}) {
    return {
      date: new Date(),
      grandTotal: new Decimal('1000.0000'),
      dueDate: new Date(),
      status: 'PAID',
      updatedAt: new Date(),
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
        ChurnPredictionService,
        { provide: PrismaService, useValue: prisma },
        { provide: ModelRegistryService, useValue: modelRegistry },
        {
          provide: AiFeedbackService,
          useValue: {
            storePrediction: jest.fn().mockResolvedValue({}),
            checkRetrainingThreshold: jest.fn().mockResolvedValue({ shouldRetrain: false }),
          },
        },
        {
          provide: AiTrainingService,
          useValue: { addTrainingData: jest.fn().mockResolvedValue({}) },
        },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
      ],
    }).compile();

    service = module.get<ChurnPredictionService>(ChurnPredictionService);

    // Default: upsert for storing profiles
    prisma.customerAiProfile.upsert.mockResolvedValue({} as any);
  });

  describe('predictChurnRisk', () => {
    it('should throw error when customer not found', async () => {
      prisma.customer.findFirst.mockResolvedValue(null as any);

      await expect(service.predictChurnRisk(orgId, 'non-existent')).rejects.toThrow(
        'Customer non-existent not found',
      );
    });

    it('should return high churn risk for customer with no recent purchases', async () => {
      const customer = createMockCustomer();
      prisma.customer.findFirst.mockResolvedValue(customer as any);

      // No invoices at all - recency=99999, frequency=0
      prisma.invoice.findMany.mockResolvedValue([] as any);

      const result = await service.predictChurnRisk(orgId, customer.id);

      expect(result).toBeDefined();
      expect(result.customerId).toBe(customer.id);
      expect(result.customerName).toBe('Test Customer');
      // With no purchases: frequency=0 -> 0.25, recency=99999 -> 0.35 = 0.60+
      expect(result.churnRisk).toBeGreaterThanOrEqual(0.5);
      expect(['HIGH', 'CRITICAL']).toContain(result.riskLevel);
    });

    it('should return low churn risk for active customer', async () => {
      const customer = createMockCustomer();
      prisma.customer.findFirst.mockResolvedValue(customer as any);

      // Recent and frequent purchases
      const recentDate = new Date();
      recentDate.setDate(recentDate.getDate() - 5); // 5 days ago
      const invoices = Array.from({ length: 10 }, (_, i) => {
        const invDate = new Date();
        invDate.setDate(invDate.getDate() - (5 + i * 7)); // weekly purchases
        const dueDate = new Date(invDate);
        dueDate.setDate(dueDate.getDate() + 30);
        return createMockInvoice({
          date: invDate,
          grandTotal: new Decimal((500 + i * 100).toString()),
          dueDate,
          updatedAt: dueDate, // paid on time
        });
      });
      prisma.invoice.findMany.mockResolvedValue(invoices as any);

      const result = await service.predictChurnRisk(orgId, customer.id);

      expect(result.churnRisk).toBeLessThan(0.4);
      expect(result.riskLevel).toBe('LOW');
    });

    it('should return RULE_BASED predictionMethod when no ML model', async () => {
      const customer = createMockCustomer();
      prisma.customer.findFirst.mockResolvedValue(customer as any);
      prisma.invoice.findMany.mockResolvedValue([] as any);
      modelRegistry.loadActiveModel.mockResolvedValue(null);

      const result = await service.predictChurnRisk(orgId, customer.id);

      expect(result.predictionMethod).toBe('RULE_BASED');
      expect(result.confidence).toBe(0.7); // Rule-based confidence
    });

    it('should include risk factors in the result', async () => {
      const customer = createMockCustomer();
      prisma.customer.findFirst.mockResolvedValue(customer as any);

      // Old single purchase
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 200);
      prisma.invoice.findMany.mockResolvedValue([
        createMockInvoice({
          date: oldDate,
          grandTotal: new Decimal('500.0000'),
        }),
      ] as any);

      const result = await service.predictChurnRisk(orgId, customer.id);

      expect(result.factors).toBeInstanceOf(Array);
      expect(result.factors.length).toBeGreaterThan(0);
      for (const factor of result.factors) {
        expect(factor).toHaveProperty('factor');
        expect(factor).toHaveProperty('impact');
        expect(factor).toHaveProperty('description');
        expect(typeof factor.impact).toBe('number');
      }
    });

    it('should include RFM features in the result', async () => {
      const customer = createMockCustomer();
      prisma.customer.findFirst.mockResolvedValue(customer as any);
      prisma.invoice.findMany.mockResolvedValue([] as any);

      const result = await service.predictChurnRisk(orgId, customer.id);

      expect(result.rfm).toBeDefined();
      expect(result.rfm).toHaveProperty('recency');
      expect(result.rfm).toHaveProperty('frequency');
      expect(result.rfm).toHaveProperty('monetary');
      expect(result.rfm).toHaveProperty('avgOrderValue');
      expect(result.rfm).toHaveProperty('paymentTimeliness');
      expect(result.rfm).toHaveProperty('purchaseTrend');
    });

    it('should store prediction in customerAiProfile', async () => {
      const customer = createMockCustomer();
      prisma.customer.findFirst.mockResolvedValue(customer as any);
      prisma.invoice.findMany.mockResolvedValue([] as any);

      await service.predictChurnRisk(orgId, customer.id);

      expect(prisma.customerAiProfile.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { customerId: customer.id },
          create: expect.objectContaining({
            customerId: customer.id,
            organizationId: orgId,
          }),
          update: expect.objectContaining({
            churnRisk: expect.any(Decimal),
          }),
        }),
      );
    });

    it('should provide a recommendation based on risk level', async () => {
      const customer = createMockCustomer();
      prisma.customer.findFirst.mockResolvedValue(customer as any);
      prisma.invoice.findMany.mockResolvedValue([] as any);

      const result = await service.predictChurnRisk(orgId, customer.id);

      expect(result.recommendation).toBeDefined();
      expect(typeof result.recommendation).toBe('string');
      expect(result.recommendation.length).toBeGreaterThan(0);
    });

    it('should cap churn risk at 1.0', async () => {
      const customer = createMockCustomer();
      prisma.customer.findFirst.mockResolvedValue(customer as any);

      // Worst case: old single purchase with declining trend and late payments
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 200);
      const dueDate = new Date(oldDate);
      dueDate.setDate(dueDate.getDate() + 30);
      const latePayDate = new Date(dueDate);
      latePayDate.setDate(latePayDate.getDate() + 45);

      prisma.invoice.findMany.mockResolvedValue([
        createMockInvoice({
          date: oldDate,
          grandTotal: new Decimal('100.0000'),
          dueDate,
          updatedAt: latePayDate,
          status: 'PAID',
        }),
      ] as any);

      const result = await service.predictChurnRisk(orgId, customer.id);

      expect(result.churnRisk).toBeLessThanOrEqual(1.0);
      expect(result.churnRisk).toBeGreaterThanOrEqual(0);
    });
  });

  describe('predictAllCustomers', () => {
    it('should process all customers and return batch result', async () => {
      prisma.customer.findMany.mockResolvedValue([
        { id: 'cust-001' },
        { id: 'cust-002' },
        { id: 'cust-003' },
      ] as any);
      // Mock individual customer lookups
      prisma.customer.findFirst.mockResolvedValue(createMockCustomer() as any);
      prisma.invoice.findMany.mockResolvedValue([] as any);

      const result = await service.predictAllCustomers(orgId);

      expect(result).toBeDefined();
      expect(result.processed).toBe(3);
      expect(result.highRisk + result.mediumRisk + result.lowRisk).toBe(3);
    });

    it('should handle empty customer list', async () => {
      prisma.customer.findMany.mockResolvedValue([] as any);

      const result = await service.predictAllCustomers(orgId);

      expect(result.processed).toBe(0);
      expect(result.highRisk).toBe(0);
      expect(result.mediumRisk).toBe(0);
      expect(result.lowRisk).toBe(0);
    });
  });

  describe('getHighRiskCustomers', () => {
    it('should return customers with churn risk >= 0.5', async () => {
      prisma.customerAiProfile.findMany.mockResolvedValue([
        {
          customerId: 'cust-001',
          customer: { id: 'cust-001', name: 'At Risk Customer', email: 'risk@test.com' },
          churnRisk: new Decimal('0.75'),
          churnFactors: [
            { factor: 'recency', impact: 0.35, description: 'No purchase in 6+ months' },
          ],
          lastPurchaseDate: new Date('2023-06-01'),
          rfmRecency: 200,
          rfmFrequency: 2,
          rfmMonetary: new Decimal('1500'),
        },
      ] as any);

      const result = await service.getHighRiskCustomers(orgId);

      expect(result).toBeInstanceOf(Array);
      expect(result.length).toBe(1);
      expect(result[0].customerName).toBe('At Risk Customer');
      expect(result[0].churnRisk).toBe(0.75);
      expect(result[0].riskLevel).toBeDefined();
    });

    it('should return empty array when no high risk customers', async () => {
      prisma.customerAiProfile.findMany.mockResolvedValue([] as any);

      const result = await service.getHighRiskCustomers(orgId);

      expect(result).toEqual([]);
    });
  });

  describe('trainModel', () => {
    it('should return insufficient data when not enough customers', async () => {
      prisma.customer.findMany.mockResolvedValue([] as any);

      const result = await service.trainModel(orgId);

      expect(result.version).toBe(0);
      expect(result.accuracy).toBe(0);
      expect(result.message).toContain('Insufficient data');
    });

    it('should return insufficient data with less than 30 customers', async () => {
      const customers = Array.from({ length: 10 }, (_, i) => ({
        id: `cust-${i}`,
      }));
      prisma.customer.findMany.mockResolvedValue(customers as any);
      // Each customer has no invoices -> extractRFMFeatures returns default
      prisma.invoice.findMany.mockResolvedValue([] as any);

      const result = await service.trainModel(orgId);

      // 10 customers < 30 required
      expect(result.version).toBe(0);
      expect(result.message).toContain('Insufficient data');
    });
  });

  describe('risk level assignment', () => {
    // Test the risk level thresholds indirectly through predictChurnRisk
    it('should assign CRITICAL for very high churn risk', async () => {
      const customer = createMockCustomer();
      prisma.customer.findFirst.mockResolvedValue(customer as any);

      // Customer with very old, single, small purchase with declining trend and late payment
      const veryOldDate = new Date();
      veryOldDate.setDate(veryOldDate.getDate() - 365);
      const dueDate = new Date(veryOldDate);
      dueDate.setDate(dueDate.getDate() + 30);
      const lateDate = new Date(dueDate);
      lateDate.setDate(lateDate.getDate() + 60);

      prisma.invoice.findMany.mockResolvedValue([
        createMockInvoice({
          date: veryOldDate,
          grandTotal: new Decimal('50.0000'),
          dueDate,
          updatedAt: lateDate,
          status: 'PAID',
        }),
      ] as any);

      const result = await service.predictChurnRisk(orgId, customer.id);

      // Recency >180 = 0.35 + frequency=1 = 0.25 + late payment >30 = 0.2 = 0.80 => CRITICAL
      expect(result.riskLevel).toBe('CRITICAL');
    });

    it('should assign LOW for active customer with frequent recent purchases', async () => {
      const customer = createMockCustomer();
      prisma.customer.findFirst.mockResolvedValue(customer as any);

      // Many recent purchases, paid on time, growing trend
      const invoices = Array.from({ length: 8 }, (_, i) => {
        const invDate = new Date();
        invDate.setDate(invDate.getDate() - (3 + i * 10));
        const dueDate = new Date(invDate);
        dueDate.setDate(dueDate.getDate() + 30);
        return createMockInvoice({
          date: invDate,
          grandTotal: new Decimal(((i + 1) * 1000).toString()),
          dueDate,
          updatedAt: new Date(invDate.getTime() + 7 * 86400000), // paid within 7 days
        });
      });
      prisma.invoice.findMany.mockResolvedValue(invoices as any);

      const result = await service.predictChurnRisk(orgId, customer.id);

      expect(result.riskLevel).toBe('LOW');
      expect(result.churnRisk).toBeLessThan(0.4);
    });
  });
});
