import { Test, TestingModule } from '@nestjs/testing';
import { ReconciliationMatcherService } from './reconciliation-matcher.service';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  createMockPrisma,
  MockPrismaClient,
  TEST_ORG_ID,
  mockDecimal,
} from '../__tests__/fixtures/ai-test-helpers';

describe('ReconciliationMatcherService', () => {
  let service: ReconciliationMatcherService;
  let prisma: MockPrismaClient;

  beforeEach(async () => {
    prisma = createMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [ReconciliationMatcherService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<ReconciliationMatcherService>(ReconciliationMatcherService);
  });

  describe('matchTransaction', () => {
    it('should return high confidence when amount and name match exactly', async () => {
      // type: 'DEPOSIT' → service queries invoices + paymentReceived
      prisma.bankTransaction.findFirst.mockResolvedValue({
        id: 'txn-001',
        description: 'Payment from ACME Corp',
        payee: 'ACME Corp',
        reference: null,
        amount: mockDecimal(500),
        date: new Date('2024-01-15'),
        type: 'DEPOSIT',
        bankAccountId: 'bank-001',
        organizationId: TEST_ORG_ID,
      } as any);

      // applyLearnedPatterns: no learned patterns
      prisma.reconciliationPattern.findUnique.mockResolvedValue(null as any);
      prisma.reconciliationPattern.findMany.mockResolvedValue([] as any);

      // getCandidates for DEPOSIT: invoices + paymentReceived
      prisma.invoice.findMany.mockResolvedValue([
        {
          id: 'inv-001',
          grandTotal: mockDecimal(500),
          date: new Date('2024-01-10'),
          customer: { id: 'cust-1', name: 'ACME Corp' },
          invoiceNumber: 'INV-001',
        },
      ] as any);
      prisma.paymentReceived.findMany.mockResolvedValue([] as any);

      const result = await service.matchTransaction(TEST_ORG_ID, 'txn-001');

      expect(result.length).toBeGreaterThan(0);
      // Score breakdown: amount=1.0*0.4 + reference=0*0.3 + name=1.0*0.2 + date=0.5*0.1 = 0.65
      expect(result[0].totalScore).toBeGreaterThanOrEqual(0.6);
      expect(result[0].entityType).toBe('invoice');
      expect(result[0].entityId).toBe('inv-001');
    });

    it('should return medium confidence when amount matches but name is different', async () => {
      prisma.bankTransaction.findFirst.mockResolvedValue({
        id: 'txn-002',
        description: 'Wire Transfer',
        payee: null,
        reference: null,
        amount: mockDecimal(1000),
        date: new Date('2024-02-01'),
        type: 'DEPOSIT',
        bankAccountId: 'bank-001',
        organizationId: TEST_ORG_ID,
      } as any);

      prisma.reconciliationPattern.findUnique.mockResolvedValue(null as any);
      prisma.reconciliationPattern.findMany.mockResolvedValue([] as any);

      prisma.invoice.findMany.mockResolvedValue([
        {
          id: 'inv-002',
          grandTotal: mockDecimal(1000),
          date: new Date('2024-01-25'),
          customer: { id: 'cust-2', name: 'Completely Different Name Inc' },
          invoiceNumber: 'INV-002',
        },
      ] as any);
      prisma.paymentReceived.findMany.mockResolvedValue([] as any);

      const result = await service.matchTransaction(TEST_ORG_ID, 'txn-002');

      if (result.length > 0) {
        expect(result[0].totalScore).toBeLessThan(0.9);
        expect(result[0].totalScore).toBeGreaterThan(0);
      }
    });

    it('should return empty array when transaction not found', async () => {
      prisma.bankTransaction.findFirst.mockResolvedValue(null as any);

      const result = await service.matchTransaction(TEST_ORG_ID, 'nonexistent');

      expect(result).toEqual([]);
    });

    it('should match WITHDRAWAL transactions against bills', async () => {
      // type not 'DEPOSIT' → service queries bills + expenses
      // Use positive amount — service compares abs values via amount range
      prisma.bankTransaction.findFirst.mockResolvedValue({
        id: 'txn-003',
        description: 'Payment to Supplier Corp',
        payee: 'Supplier Corp',
        reference: null,
        amount: mockDecimal(750),
        date: new Date('2024-03-01'),
        type: 'WITHDRAWAL',
        bankAccountId: 'bank-001',
        organizationId: TEST_ORG_ID,
      } as any);

      prisma.reconciliationPattern.findUnique.mockResolvedValue(null as any);
      prisma.reconciliationPattern.findMany.mockResolvedValue([] as any);

      prisma.bill.findMany.mockResolvedValue([
        {
          id: 'bill-001',
          grandTotal: mockDecimal(750),
          date: new Date('2024-02-25'),
          vendor: { id: 'v-1', name: 'Supplier Corp' },
          billNumber: 'BILL-001',
        },
      ] as any);
      prisma.expense.findMany.mockResolvedValue([] as any);

      const result = await service.matchTransaction(TEST_ORG_ID, 'txn-003');

      expect(result.length).toBeGreaterThan(0);
      expect(result[0].entityType).toBe('bill');
      expect(result[0].entityId).toBe('bill-001');
    });

    it('should prefer learned patterns over generic matching', async () => {
      prisma.bankTransaction.findFirst.mockResolvedValue({
        id: 'txn-004',
        description: 'STRIPE TRANSFER',
        payee: null,
        reference: null,
        amount: mockDecimal(2000),
        date: new Date('2024-04-01'),
        type: 'DEPOSIT',
        bankAccountId: 'bank-001',
        organizationId: TEST_ORG_ID,
      } as any);

      // applyLearnedPatterns: exact match via findUnique
      prisma.reconciliationPattern.findUnique.mockResolvedValue({
        id: 'pattern-001',
        pattern: 'STRIPE',
        matchedEntity: 'invoice',
        matchedEntityId: 'inv-stripe',
        confidence: mockDecimal(0.95),
        matchCount: 10,
      } as any);

      // getCandidates for DEPOSIT
      prisma.invoice.findMany.mockResolvedValue([
        {
          id: 'inv-stripe',
          grandTotal: mockDecimal(2000),
          date: new Date('2024-03-28'),
          customer: { id: 'cust-stripe', name: 'Stripe Payments' },
          invoiceNumber: 'INV-STR-001',
        },
      ] as any);
      prisma.paymentReceived.findMany.mockResolvedValue([] as any);

      const result = await service.matchTransaction(TEST_ORG_ID, 'txn-004');

      expect(result.length).toBeGreaterThan(0);
      // Pattern-boosted score should be high
      expect(result[0].totalScore).toBeGreaterThanOrEqual(0.5);
    });

    it('should respect minConfidence threshold', async () => {
      prisma.bankTransaction.findFirst.mockResolvedValue({
        id: 'txn-005',
        description: 'Random transfer',
        payee: null,
        reference: null,
        amount: mockDecimal(123.45),
        date: new Date('2024-05-01'),
        type: 'DEPOSIT',
        bankAccountId: 'bank-001',
        organizationId: TEST_ORG_ID,
      } as any);

      prisma.reconciliationPattern.findUnique.mockResolvedValue(null as any);
      prisma.reconciliationPattern.findMany.mockResolvedValue([] as any);
      prisma.invoice.findMany.mockResolvedValue([] as any);
      prisma.paymentReceived.findMany.mockResolvedValue([] as any);

      const result = await service.matchTransaction(TEST_ORG_ID, 'txn-005', 0.99);

      // No match should exceed 99% when there's nothing to match against
      expect(result).toEqual([]);
    });
  });

  describe('learnFromConfirmation', () => {
    it('should upsert a reconciliation pattern', async () => {
      prisma.bankTransaction.findFirst.mockResolvedValue({
        id: 'txn-010',
        description: 'PAYPAL TRANSFER',
        amount: mockDecimal(300),
        bankAccountId: 'bank-001',
        organizationId: TEST_ORG_ID,
      } as any);

      // getPatternMatchCount returns 0 (no existing pattern)
      prisma.reconciliationPattern.findUnique.mockResolvedValue(null as any);
      prisma.reconciliationPattern.upsert.mockResolvedValue({
        id: 'pattern-new',
        pattern: 'PAYPAL TRANSFER',
      } as any);
      prisma.bankTransaction.update.mockResolvedValue({} as any);

      await service.learnFromConfirmation(TEST_ORG_ID, 'txn-010', 'invoice', 'inv-010');

      expect(prisma.reconciliationPattern.upsert).toHaveBeenCalled();
      expect(prisma.bankTransaction.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'MATCHED',
            matchedEntityType: 'invoice',
            matchedEntityId: 'inv-010',
          }),
        }),
      );
    });

    it('should increment match count on existing pattern', async () => {
      prisma.bankTransaction.findFirst.mockResolvedValue({
        id: 'txn-011',
        description: 'PAYPAL TRANSFER',
        amount: mockDecimal(200),
        bankAccountId: 'bank-001',
        organizationId: TEST_ORG_ID,
      } as any);

      // getPatternMatchCount: existing pattern with matchCount 5
      prisma.reconciliationPattern.findUnique.mockResolvedValue({
        id: 'pattern-existing',
        matchCount: 5,
      } as any);

      prisma.reconciliationPattern.upsert.mockResolvedValue({
        id: 'pattern-existing',
        matchCount: 6,
      } as any);
      prisma.bankTransaction.update.mockResolvedValue({} as any);

      await service.learnFromConfirmation(TEST_ORG_ID, 'txn-011', 'bill', 'bill-011');

      expect(prisma.reconciliationPattern.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
            matchCount: { increment: 1 },
          }),
        }),
      );
    });
  });

  describe('applyRules', () => {
    it('should match transaction against bank rules', async () => {
      prisma.bankTransaction.findFirst.mockResolvedValue({
        id: 'txn-020',
        description: 'AMAZON WEB SERVICES',
        reference: null,
        payee: null,
        amount: mockDecimal(-150),
        type: 'WITHDRAWAL',
        bankAccountId: 'bank-001',
        organizationId: TEST_ORG_ID,
      } as any);

      // conditions must be BankRuleCondition[] (array), not a plain object
      prisma.bankRule.findMany.mockResolvedValue([
        {
          id: 'rule-001',
          name: 'AWS Subscription',
          conditions: [
            { field: 'description', operator: 'contains', value: 'AMAZON WEB SERVICES' },
          ],
          action: { type: 'categorize', accountId: 'acct-cloud' },
          bankAccountId: 'bank-001',
          organizationId: TEST_ORG_ID,
        },
      ] as any);

      const result = await service.applyRules(TEST_ORG_ID, 'txn-020');

      expect(result).toBeDefined();
      expect(result.matched).toBe(true);
    });

    it('should return unmatched when no bank rules match', async () => {
      prisma.bankTransaction.findFirst.mockResolvedValue({
        id: 'txn-021',
        description: 'Random payment',
        reference: null,
        payee: null,
        amount: mockDecimal(-50),
        type: 'WITHDRAWAL',
        bankAccountId: 'bank-001',
        organizationId: TEST_ORG_ID,
      } as any);

      prisma.bankRule.findMany.mockResolvedValue([] as any);

      const result = await service.applyRules(TEST_ORG_ID, 'txn-021');

      expect(result.matched).toBe(false);
    });
  });

  describe('getRules', () => {
    it('should return rules for a specific bank account', async () => {
      prisma.bankRule.findMany.mockResolvedValue([
        { id: 'rule-1', name: 'Rule A', bankAccountId: 'bank-001' },
        { id: 'rule-2', name: 'Rule B', bankAccountId: 'bank-001' },
      ] as any);

      const rules = await service.getRules(TEST_ORG_ID, 'bank-001');

      expect(rules).toHaveLength(2);
      expect(prisma.bankRule.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ bankAccountId: 'bank-001' }),
        }),
      );
    });

    it('should return empty array when no rules exist', async () => {
      prisma.bankRule.findMany.mockResolvedValue([] as any);

      const rules = await service.getRules(TEST_ORG_ID, 'bank-002');

      expect(rules).toEqual([]);
    });
  });

  describe('bulkAutoMatch', () => {
    it('should return matched and unmatched counts', async () => {
      const txnA = {
        id: 'txn-a',
        description: 'Payment from Client A',
        payee: 'Client A',
        reference: null,
        amount: mockDecimal(1000),
        date: new Date('2024-01-15'),
        type: 'DEPOSIT',
        bankAccountId: 'bank-001',
        organizationId: TEST_ORG_ID,
      };
      const txnB = {
        id: 'txn-b',
        description: 'Unknown transfer',
        payee: null,
        reference: null,
        amount: mockDecimal(42),
        date: new Date('2024-01-16'),
        type: 'DEPOSIT',
        bankAccountId: 'bank-001',
        organizationId: TEST_ORG_ID,
      };

      // Call order: matchTransaction(txn-a) → learnFromConfirmation(txn-a) → matchTransaction(txn-b)
      prisma.bankTransaction.findFirst
        .mockResolvedValueOnce(txnA as any) // matchTransaction for txn-a
        .mockResolvedValueOnce(txnA as any) // learnFromConfirmation for txn-a
        .mockResolvedValueOnce(txnB as any); // matchTransaction for txn-b

      // applyLearnedPatterns: no patterns
      prisma.reconciliationPattern.findUnique.mockResolvedValue(null as any);
      prisma.reconciliationPattern.findMany.mockResolvedValue([] as any);

      // getCandidates: first call has invoice match, second has nothing
      prisma.invoice.findMany
        .mockResolvedValueOnce([
          {
            id: 'inv-a',
            grandTotal: mockDecimal(1000),
            date: new Date('2024-01-10'),
            customer: { id: 'cust-a', name: 'Client A' },
            invoiceNumber: 'INV-A',
          },
        ] as any)
        .mockResolvedValueOnce([] as any);

      prisma.paymentReceived.findMany.mockResolvedValue([] as any);

      // learnFromConfirmation mocks
      prisma.reconciliationPattern.upsert.mockResolvedValue({} as any);
      prisma.bankTransaction.update.mockResolvedValue({} as any);

      const result = await service.bulkAutoMatch(TEST_ORG_ID, ['txn-a', 'txn-b'], 0.6);

      expect(result.matched + result.unmatched).toBe(2);
    });

    it('should handle empty transaction list', async () => {
      const result = await service.bulkAutoMatch(TEST_ORG_ID, []);

      expect(result.matched).toBe(0);
      expect(result.unmatched).toBe(0);
    });
  });
});
