import { Test, TestingModule } from '@nestjs/testing';
import { FraudDetectionService } from './fraud-detection.service';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  createMockPrisma,
  MockPrismaClient,
  TEST_ORG_ID,
  mockDecimal,
} from '../__tests__/fixtures/ai-test-helpers';

describe('FraudDetectionService', () => {
  let service: FraudDetectionService;
  let prisma: MockPrismaClient;

  const orgId = TEST_ORG_ID;

  /** Helper to create a mock expense entity */
  function createMockExpense(overrides: Record<string, any> = {}) {
    return {
      id: 'exp-001',
      organizationId: orgId,
      amount: mockDecimal(500),
      createdAt: new Date('2025-06-15T10:00:00Z'),
      deletedAt: null,
      ...overrides,
    };
  }

  /** Helper to create a mock journal entity */
  function createMockJournal(overrides: Record<string, any> = {}) {
    return {
      id: 'jrn-001',
      organizationId: orgId,
      lines: [
        { debit: mockDecimal(1000), credit: mockDecimal(0) },
        { debit: mockDecimal(0), credit: mockDecimal(1000) },
      ],
      createdAt: new Date('2025-06-15T10:00:00Z'),
      deletedAt: null,
      ...overrides,
    };
  }

  /** Helper to create a mock bank transaction entity */
  function createMockBankTransaction(overrides: Record<string, any> = {}) {
    return {
      id: 'bt-001',
      organizationId: orgId,
      amount: mockDecimal(750),
      createdAt: new Date('2025-06-15T10:00:00Z'),
      ...overrides,
    };
  }

  /** Helper to build a list of historical amounts for mocking */
  function buildHistoricalExpenses(amounts: number[]) {
    return amounts.map((a) => ({ amount: mockDecimal(a) }));
  }

  beforeEach(async () => {
    prisma = createMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [FraudDetectionService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<FraudDetectionService>(FraudDetectionService);
  });

  // ---------------------------------------------------------------------------
  // scoreTransaction
  // ---------------------------------------------------------------------------
  describe('scoreTransaction', () => {
    it('should return a FraudScoreResult with all required fields', async () => {
      const expense = createMockExpense();
      prisma.expense.findUnique.mockResolvedValue(expense as any);
      prisma.expense.findMany.mockResolvedValue([] as any);
      prisma.expense.count.mockResolvedValue(1 as any);

      const result = await service.scoreTransaction(orgId, 'expense', 'exp-001');

      expect(result).toBeDefined();
      expect(result.entityType).toBe('expense');
      expect(result.entityId).toBe('exp-001');
      expect(typeof result.fraudScore).toBe('number');
      expect(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).toContain(result.riskLevel);
      expect(Array.isArray(result.signals)).toBe(true);
      expect(result.signals.length).toBe(5);
    });

    it('should score a normal business-hours expense as LOW risk', async () => {
      // Normal amount during business hours, no duplicates, low velocity
      const expense = createMockExpense({
        amount: mockDecimal(500),
        createdAt: new Date('2025-06-16T14:00:00Z'), // Monday 2pm
      });
      prisma.expense.findUnique.mockResolvedValue(expense as any);
      // Few historical amounts (< 10), so amount check won't trigger
      prisma.expense.findMany.mockResolvedValue(buildHistoricalExpenses([400, 500, 600]) as any);
      prisma.expense.count.mockResolvedValue(2 as any); // Low velocity

      const result = await service.scoreTransaction(orgId, 'expense', 'exp-001');

      expect(result.riskLevel).toBe('LOW');
      expect(result.fraudScore).toBeLessThan(0.5);
      expect(result.isAnomaly).toBe(false);
    });

    it('should flag high amount deviation as anomaly signal', async () => {
      const expense = createMockExpense({ amount: mockDecimal(50000) });
      prisma.expense.findUnique.mockResolvedValue(expense as any);
      // 15 historical amounts around 500 with variance so stdDev > 0
      const historical = buildHistoricalExpenses([
        400, 450, 470, 500, 510, 520, 480, 490, 530, 460, 500, 510, 440, 520, 490,
      ]);
      prisma.expense.findMany.mockResolvedValue(historical as any);
      prisma.expense.count.mockResolvedValue(1 as any);

      const result = await service.scoreTransaction(orgId, 'expense', 'exp-001');

      const amountSignal = result.signals.find((s) => s.signal === 'amount_anomaly');
      expect(amountSignal).toBeDefined();
      expect(amountSignal!.score).toBeGreaterThan(0);
    });

    it('should flag off-hours (2am) transaction with time anomaly', async () => {
      // Use a time that is off-hours in any reasonable timezone (midnight-3am UTC)
      const expense = createMockExpense({
        createdAt: new Date('2025-06-16T02:00:00Z'), // 2 AM UTC
      });
      prisma.expense.findUnique.mockResolvedValue(expense as any);
      prisma.expense.findMany.mockResolvedValue([] as any);
      prisma.expense.count.mockResolvedValue(1 as any);

      const result = await service.scoreTransaction(orgId, 'expense', 'exp-001');

      const timeSignal = result.signals.find((s) => s.signal === 'time_anomaly');
      expect(timeSignal).toBeDefined();
      expect(timeSignal!.triggered).toBe(true);
      // Score depends on local timezone interpretation of getHours()
      // 0-4 -> 0.8, 5-6 or 22-23 -> 0.4; both are > 0.3 (triggered threshold)
      expect(timeSignal!.score).toBeGreaterThanOrEqual(0.4);
    });

    it('should flag weekend transaction with elevated time anomaly', async () => {
      const expense = createMockExpense({
        createdAt: new Date('2025-06-14T15:00:00Z'), // Saturday 3pm
      });
      prisma.expense.findUnique.mockResolvedValue(expense as any);
      prisma.expense.findMany.mockResolvedValue([] as any);
      prisma.expense.count.mockResolvedValue(1 as any);

      const result = await service.scoreTransaction(orgId, 'expense', 'exp-001');

      const timeSignal = result.signals.find((s) => s.signal === 'time_anomaly');
      expect(timeSignal).toBeDefined();
      expect(timeSignal!.description).toContain('weekend');
    });

    it('should flag high velocity (>20 in 1 hour) with velocity signal', async () => {
      const expense = createMockExpense();
      prisma.expense.findUnique.mockResolvedValue(expense as any);
      prisma.expense.findMany.mockResolvedValue([] as any);
      prisma.expense.count.mockResolvedValue(25 as any); // 25 in 1 hour

      const result = await service.scoreTransaction(orgId, 'expense', 'exp-001');

      const velocitySignal = result.signals.find((s) => s.signal === 'velocity');
      expect(velocitySignal).toBeDefined();
      expect(velocitySignal!.triggered).toBe(true);
      expect(velocitySignal!.score).toBeGreaterThanOrEqual(0.9);
    });

    it('should flag duplicate same-day same-amount expense', async () => {
      const expense = createMockExpense({ amount: mockDecimal(1000) });
      prisma.expense.findUnique.mockResolvedValue(expense as any);
      prisma.expense.findMany.mockResolvedValue([] as any);
      prisma.expense.count
        .mockResolvedValueOnce(1 as any) // velocity check
        .mockResolvedValueOnce(3 as any); // duplicate check -> 3 duplicates

      const result = await service.scoreTransaction(orgId, 'expense', 'exp-001');

      const dupSignal = result.signals.find((s) => s.signal === 'duplicate');
      expect(dupSignal).toBeDefined();
      expect(dupSignal!.triggered).toBe(true);
    });

    it('should handle Benford check with insufficient data gracefully', async () => {
      const expense = createMockExpense();
      prisma.expense.findUnique.mockResolvedValue(expense as any);
      // < 50 items, so Benford can't run
      prisma.expense.findMany.mockResolvedValue(buildHistoricalExpenses([100, 200]) as any);
      prisma.expense.count.mockResolvedValue(1 as any);

      const result = await service.scoreTransaction(orgId, 'expense', 'exp-001');

      const benfordSignal = result.signals.find((s) => s.signal === 'benford');
      expect(benfordSignal).toBeDefined();
      expect(benfordSignal!.score).toBe(0);
      expect(benfordSignal!.triggered).toBe(false);
    });

    it('should handle journal entity type correctly', async () => {
      const journal = createMockJournal();
      prisma.journal.findUnique.mockResolvedValue(journal as any);
      prisma.journal.findMany.mockResolvedValue([] as any);
      prisma.journal.count.mockResolvedValue(1 as any);

      const result = await service.scoreTransaction(orgId, 'journal', 'jrn-001');

      expect(result.entityType).toBe('journal');
      expect(result.entityId).toBe('jrn-001');
      expect(result.signals.length).toBe(5);
    });

    it('should handle bank_transaction entity type correctly', async () => {
      const bt = createMockBankTransaction();
      prisma.bankTransaction.findUnique.mockResolvedValue(bt as any);
      prisma.bankTransaction.findMany.mockResolvedValue([] as any);
      prisma.bankTransaction.count.mockResolvedValue(1 as any);

      const result = await service.scoreTransaction(orgId, 'bank_transaction', 'bt-001');

      expect(result.entityType).toBe('bank_transaction');
      expect(result.entityId).toBe('bt-001');
    });

    it('should return 0 amount for unknown entity type', async () => {
      const result = await service.scoreTransaction(orgId, 'unknown', 'x-001');

      expect(result.entityType).toBe('unknown');
      expect(result.fraudScore).toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  // dailyFraudScan
  // ---------------------------------------------------------------------------
  describe('dailyFraudScan', () => {
    it('should scan recent journals, bank transactions, and expenses', async () => {
      prisma.journal.findMany.mockResolvedValue([{ id: 'jrn-1' }] as any);
      prisma.bankTransaction.findMany.mockResolvedValue([{ id: 'bt-1' }] as any);
      prisma.expense.findMany
        .mockResolvedValueOnce([{ id: 'exp-1' }] as any) // dailyFraudScan expenses
        .mockResolvedValueOnce([] as any); // historical amounts

      // Mock inner scoreTransaction calls
      prisma.journal.findUnique.mockResolvedValue(createMockJournal() as any);
      prisma.bankTransaction.findUnique.mockResolvedValue(createMockBankTransaction() as any);
      prisma.expense.findUnique.mockResolvedValue(createMockExpense() as any);
      prisma.expense.count.mockResolvedValue(1 as any);
      prisma.journal.count.mockResolvedValue(1 as any);
      prisma.bankTransaction.count.mockResolvedValue(1 as any);
      prisma.fraudAlert.findFirst.mockResolvedValue(null as any);
      prisma.fraudAlert.create.mockResolvedValue({} as any);

      const result = await service.dailyFraudScan(orgId);

      expect(result).toHaveProperty('scanned');
      expect(result).toHaveProperty('alertsCreated');
      expect(result.scanned).toBeGreaterThanOrEqual(3);
    });

    it('should return zero scanned when no recent transactions exist', async () => {
      prisma.journal.findMany.mockResolvedValue([] as any);
      prisma.bankTransaction.findMany.mockResolvedValue([] as any);
      prisma.expense.findMany.mockResolvedValue([] as any);

      const result = await service.dailyFraudScan(orgId);

      expect(result.scanned).toBe(0);
      expect(result.alertsCreated).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // getFraudAlerts
  // ---------------------------------------------------------------------------
  describe('getFraudAlerts', () => {
    it('should return all fraud alerts for the organization', async () => {
      const mockAlerts = [
        { id: 'alert-1', organizationId: orgId, isResolved: false },
        { id: 'alert-2', organizationId: orgId, isResolved: true },
      ];
      prisma.fraudAlert.findMany.mockResolvedValue(mockAlerts as any);

      const result = await service.getFraudAlerts(orgId);

      expect(result).toHaveLength(2);
      expect(prisma.fraudAlert.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { organizationId: orgId },
        }),
      );
    });

    it('should filter by resolved status when provided', async () => {
      prisma.fraudAlert.findMany.mockResolvedValue([] as any);

      await service.getFraudAlerts(orgId, false);

      expect(prisma.fraudAlert.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { organizationId: orgId, isResolved: false },
        }),
      );
    });

    it('should respect the limit parameter', async () => {
      prisma.fraudAlert.findMany.mockResolvedValue([] as any);

      await service.getFraudAlerts(orgId, undefined, 5);

      expect(prisma.fraudAlert.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 5,
        }),
      );
    });

    it('should default limit to 100 when not provided', async () => {
      prisma.fraudAlert.findMany.mockResolvedValue([] as any);

      await service.getFraudAlerts(orgId);

      expect(prisma.fraudAlert.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 100,
        }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // resolveAlert
  // ---------------------------------------------------------------------------
  describe('resolveAlert', () => {
    it('should mark the alert as resolved with confirmed fraud = true', async () => {
      prisma.fraudAlert.update.mockResolvedValue({} as any);

      await service.resolveAlert(orgId, 'alert-001', true, 'user-001');

      expect(prisma.fraudAlert.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'alert-001' },
          data: expect.objectContaining({
            isResolved: true,
            isConfirmedFraud: true,
            resolvedBy: 'user-001',
          }),
        }),
      );
    });

    it('should mark the alert as resolved with confirmed fraud = false', async () => {
      prisma.fraudAlert.update.mockResolvedValue({} as any);

      await service.resolveAlert(orgId, 'alert-002', false, 'user-002');

      expect(prisma.fraudAlert.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            isResolved: true,
            isConfirmedFraud: false,
            resolvedBy: 'user-002',
          }),
        }),
      );
    });
  });
});
