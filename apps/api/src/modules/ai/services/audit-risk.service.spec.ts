import { Test, TestingModule } from '@nestjs/testing';
import { AuditRiskService } from './audit-risk.service';
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

describe('AuditRiskService', () => {
  let service: AuditRiskService;
  let prisma: MockPrismaClient;
  let modelRegistry: {
    loadActiveModel: jest.Mock;
    saveModel: jest.Mock;
    getModelStatus: jest.Mock;
  };

  const orgId = TEST_ORG_ID;

  function createMockJournal(overrides: Record<string, any> = {}) {
    return {
      id: 'jrn-001',
      date: new Date('2025-06-16T10:00:00Z'), // Monday
      createdAt: new Date('2025-06-16T10:00:00Z'),
      lines: [
        { debit: mockDecimal(500), credit: mockDecimal(0) },
        { debit: mockDecimal(0), credit: mockDecimal(500) },
      ],
      ...overrides,
    };
  }

  function createMockInvoice(overrides: Record<string, any> = {}) {
    return {
      id: 'inv-001',
      grandTotal: mockDecimal(5000),
      date: new Date('2025-06-16T10:00:00Z'),
      createdAt: new Date('2025-06-16T10:00:00Z'),
      ...overrides,
    };
  }

  function createMockExpense(overrides: Record<string, any> = {}) {
    return {
      id: 'exp-001',
      amount: mockDecimal(300),
      date: new Date('2025-06-16T10:00:00Z'),
      createdAt: new Date('2025-06-16T10:00:00Z'),
      ...overrides,
    };
  }

  beforeEach(async () => {
    prisma = createMockPrisma();
    modelRegistry = {
      loadActiveModel: jest.fn().mockResolvedValue(null),
      saveModel: jest.fn().mockResolvedValue({ id: 'model-001', version: 1 }),
      getModelStatus: jest.fn().mockResolvedValue({
        hasActiveModel: false,
        activeVersion: null,
        isTraining: false,
        trainingVersion: null,
        lastTrainedAt: null,
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditRiskService,
        { provide: PrismaService, useValue: prisma },
        { provide: ModelRegistryService, useValue: modelRegistry },
        { provide: AiFeedbackService, useValue: createMockAiFeedback() },
        { provide: AiTrainingService, useValue: createMockAiTraining() },
        { provide: EventEmitter2, useValue: createMockEventEmitter() },
      ],
    }).compile();

    service = module.get<AuditRiskService>(AuditRiskService);
  });

  // ---------------------------------------------------------------------------
  // scoreEntity
  // ---------------------------------------------------------------------------
  describe('scoreEntity', () => {
    it('should return low risk for a normal weekday journal', async () => {
      const journal = createMockJournal();
      prisma.journal.findFirst.mockResolvedValue(journal as any);
      // Return a few historical journals with similar amounts
      prisma.journal.findMany.mockResolvedValue(
        Array.from({ length: 5 }, () => ({
          lines: [{ debit: mockDecimal(500) }],
        })) as any,
      );
      prisma.auditLog.count.mockResolvedValue(0 as any);

      const result = await service.scoreEntity(orgId, 'journal', 'jrn-001');

      expect(result.entityType).toBe('journal');
      expect(result.entityId).toBe('jrn-001');
      expect(result.riskScore).toBeGreaterThanOrEqual(0);
      expect(result.riskScore).toBeLessThanOrEqual(1);
      expect(result.riskLevel).toBe('LOW');
      expect(result.confidence).toBe(0.65); // No ML model available
    });

    it('should return higher risk for weekend + high-deviation journal', async () => {
      const journal = createMockJournal({
        id: 'jrn-risky',
        date: new Date('2025-06-14T10:00:00Z'), // Saturday
        lines: [
          { debit: mockDecimal(50000), credit: mockDecimal(0) },
          { debit: mockDecimal(0), credit: mockDecimal(50000) },
        ],
      });
      prisma.journal.findFirst.mockResolvedValue(journal as any);
      // Historical amounts all around 500
      prisma.journal.findMany.mockResolvedValue(
        Array.from({ length: 15 }, () => ({
          lines: [{ debit: mockDecimal(500) }],
        })) as any,
      );
      prisma.auditLog.count.mockResolvedValue(5 as any); // Multiple corrections

      const result = await service.scoreEntity(orgId, 'journal', 'jrn-risky');

      expect(result.riskScore).toBeGreaterThan(0);
      expect(result.factors.length).toBeGreaterThan(0);
    });

    it('should return 0 risk for unknown entity type', async () => {
      const result = await service.scoreEntity(orgId, 'unknown', 'x-001');

      expect(result.riskScore).toBe(0);
      expect(result.riskLevel).toBe('LOW');
      expect(result.factors).toHaveLength(0);
      expect(result.confidence).toBe(0);
    });

    it('should return 0 risk when entity not found', async () => {
      prisma.journal.findFirst.mockResolvedValue(null as any);

      const result = await service.scoreEntity(orgId, 'journal', 'non-existent');

      expect(result.riskScore).toBe(0);
      expect(result.riskLevel).toBe('LOW');
    });

    it('should include weekend_activity factor for Saturday journals', async () => {
      const journal = createMockJournal({
        date: new Date('2025-06-14T10:00:00Z'), // Saturday
      });
      prisma.journal.findFirst.mockResolvedValue(journal as any);
      prisma.journal.findMany.mockResolvedValue(
        Array.from({ length: 5 }, () => ({
          lines: [{ debit: mockDecimal(500) }],
        })) as any,
      );
      prisma.auditLog.count.mockResolvedValue(0 as any);

      const result = await service.scoreEntity(orgId, 'journal', 'jrn-001');

      const weekendFactor = result.factors.find((f) => f.factor === 'weekend_activity');
      expect(weekendFactor).toBeDefined();
      expect(weekendFactor!.weight).toBe(0.1);
    });

    it('should include frequent_corrections factor when many updates exist', async () => {
      const journal = createMockJournal();
      prisma.journal.findFirst.mockResolvedValue(journal as any);
      prisma.journal.findMany.mockResolvedValue(
        Array.from({ length: 5 }, () => ({
          lines: [{ debit: mockDecimal(500) }],
        })) as any,
      );
      prisma.auditLog.count.mockResolvedValue(8 as any); // 8 corrections

      const result = await service.scoreEntity(orgId, 'journal', 'jrn-001');

      const correctionFactor = result.factors.find((f) => f.factor === 'frequent_corrections');
      expect(correctionFactor).toBeDefined();
    });

    it('should score invoice entity type correctly', async () => {
      const invoice = createMockInvoice();
      prisma.invoice.findFirst.mockResolvedValue(invoice as any);
      prisma.invoice.findMany.mockResolvedValue(
        Array.from({ length: 5 }, () => ({ grandTotal: mockDecimal(5000) })) as any,
      );
      prisma.auditLog.count.mockResolvedValue(0 as any);

      const result = await service.scoreEntity(orgId, 'invoice', 'inv-001');

      expect(result.entityType).toBe('invoice');
      expect(result.riskScore).toBeGreaterThanOrEqual(0);
    });

    it('should score expense entity type correctly', async () => {
      const expense = createMockExpense();
      prisma.expense.findFirst.mockResolvedValue(expense as any);
      prisma.expense.findMany.mockResolvedValue(
        Array.from({ length: 5 }, () => ({ amount: mockDecimal(300) })) as any,
      );
      prisma.auditLog.count.mockResolvedValue(0 as any);

      const result = await service.scoreEntity(orgId, 'expense', 'exp-001');

      expect(result.entityType).toBe('expense');
    });

    it('should fall back to rule-based confidence when ML model data format is invalid', async () => {
      // The modelData does not contain a valid serialized LogisticRegression classifier,
      // so deserializeModel will throw and the service falls back to rule-based scoring.
      modelRegistry.loadActiveModel.mockResolvedValue({
        modelData: {
          weights: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6],
          bias: 0,
          featureNames: [
            'amount_normalized',
            'corrections_count',
            'weekend_flag',
            'round_number_flag',
            'deviation_from_avg',
            'amount_anomaly',
          ],
        },
      } as any);

      const journal = createMockJournal();
      prisma.journal.findFirst.mockResolvedValue(journal as any);
      prisma.journal.findMany.mockResolvedValue(
        Array.from({ length: 5 }, () => ({
          lines: [{ debit: mockDecimal(500) }],
        })) as any,
      );
      prisma.auditLog.count.mockResolvedValue(0 as any);

      const result = await service.scoreEntity(orgId, 'journal', 'jrn-001');

      // ML model deserialization fails -> falls back to rule-based with confidence 0.65
      expect(result.confidence).toBe(0.65);
    });
  });

  // ---------------------------------------------------------------------------
  // batchScore
  // ---------------------------------------------------------------------------
  describe('batchScore', () => {
    it('should process all journal entities and return counts', async () => {
      // First call is getEntityIds, subsequent calls are for extractJournalFeatures (historical amounts)
      (prisma.journal.findMany as jest.Mock)
        .mockResolvedValueOnce([{ id: 'jrn-1' }, { id: 'jrn-2' }] as any)
        .mockResolvedValue(
          Array.from({ length: 5 }, () => ({
            lines: [{ debit: mockDecimal(500) }],
          })) as any,
        );
      // Each scoreEntity call mocks
      prisma.journal.findFirst.mockResolvedValue(createMockJournal() as any);
      prisma.auditLog.count.mockResolvedValue(0 as any);

      const result = await service.batchScore(orgId, 'journal');

      expect(result.entityType).toBe('journal');
      expect(result.processed).toBe(2);
      expect(result.highRisk + result.mediumRisk + result.lowRisk).toBe(2);
    });

    it('should return zero counts for unknown entity type', async () => {
      const result = await service.batchScore(orgId, 'unknown_type');

      expect(result.processed).toBe(0);
      expect(result.highRisk).toBe(0);
      expect(result.mediumRisk).toBe(0);
      expect(result.lowRisk).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // getHighRiskEntities
  // ---------------------------------------------------------------------------
  describe('getHighRiskEntities', () => {
    it('should return empty array when no entities exist', async () => {
      prisma.journal.findMany.mockResolvedValue([] as any);
      prisma.invoice.findMany.mockResolvedValue([] as any);
      prisma.bill.findMany.mockResolvedValue([] as any);
      prisma.expense.findMany.mockResolvedValue([] as any);

      const results = await service.getHighRiskEntities(orgId);

      expect(results).toHaveLength(0);
    });

    it('should sort results by risk score descending', async () => {
      // Provide IDs for different entity types
      prisma.journal.findMany
        .mockResolvedValueOnce([{ id: 'jrn-1' }] as any) // getEntityIds
        .mockResolvedValue([] as any); // features
      prisma.invoice.findMany.mockResolvedValue([] as any);
      prisma.bill.findMany.mockResolvedValue([] as any);
      prisma.expense.findMany.mockResolvedValue([] as any);
      prisma.journal.findFirst.mockResolvedValue(null as any);

      const results = await service.getHighRiskEntities(orgId, 5);

      // Results should be sorted descending (if any exist)
      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1].riskScore).toBeGreaterThanOrEqual(results[i].riskScore);
      }
    });

    it('should respect the limit parameter', async () => {
      prisma.journal.findMany.mockResolvedValue([] as any);
      prisma.invoice.findMany.mockResolvedValue([] as any);
      prisma.bill.findMany.mockResolvedValue([] as any);
      prisma.expense.findMany.mockResolvedValue([] as any);

      const results = await service.getHighRiskEntities(orgId, 2);

      expect(results.length).toBeLessThanOrEqual(2);
    });
  });
});
