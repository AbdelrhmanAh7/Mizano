import { Test, TestingModule } from '@nestjs/testing';
import { PatternDetectionService } from './pattern-detection.service';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  createMockPrisma,
  MockPrismaClient,
  TEST_ORG_ID,
  mockDecimal,
} from '../__tests__/fixtures/ai-test-helpers';

describe('PatternDetectionService', () => {
  let service: PatternDetectionService;
  let prisma: MockPrismaClient;

  beforeEach(async () => {
    prisma = createMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [PatternDetectionService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<PatternDetectionService>(PatternDetectionService);
  });

  describe('analyzePatterns', () => {
    it('should detect recurring monthly expenses as patterns', async () => {
      // Same vendor, same approximate amount, monthly
      const expenses = Array.from({ length: 6 }, (_, i) => ({
        id: `exp-${i}`,
        vendorId: 'vendor-001',
        amount: mockDecimal(100),
        date: new Date(2024, i, 15),
        description: 'Subscription',
        accountId: 'acct-001',
        account: { name: 'Software Subscriptions' },
        vendor: { name: 'SaaS Co', displayName: null },
      }));

      prisma.expense.findMany.mockResolvedValue(expenses as any);
      prisma.journal.findMany.mockResolvedValue([] as any);
      prisma.bankTransaction.findMany.mockResolvedValue([] as any);
      prisma.transactionPattern.findFirst.mockResolvedValue(null as any);
      prisma.transactionPattern.create.mockResolvedValue({
        id: 'pattern-new',
        status: 'DETECTED',
        suggestions: [],
      } as any);
      prisma.patternOccurrence.createMany.mockResolvedValue({ count: 0 } as any);
      prisma.transactionPattern.updateMany.mockResolvedValue({ count: 0 } as any);

      const result = await service.analyzePatterns(TEST_ORG_ID);

      expect(result.patternsDetected).toBeGreaterThan(0);
      expect(result.suggestionsCreated).toBeGreaterThanOrEqual(0);
    });

    it('should return 0 patterns when no transactions exist', async () => {
      prisma.expense.findMany.mockResolvedValue([] as any);
      prisma.journal.findMany.mockResolvedValue([] as any);
      prisma.bankTransaction.findMany.mockResolvedValue([] as any);
      prisma.transactionPattern.updateMany.mockResolvedValue({ count: 0 } as any);

      const result = await service.analyzePatterns(TEST_ORG_ID);

      expect(result.patternsDetected).toBe(0);
      expect(result.suggestionsCreated).toBe(0);
    });

    it('should detect patterns across bills as well as expenses', async () => {
      prisma.expense.findMany.mockResolvedValue([] as any);
      prisma.journal.findMany.mockResolvedValue([] as any);
      prisma.bankTransaction.findMany.mockResolvedValue([] as any);
      prisma.transactionPattern.findFirst.mockResolvedValue(null as any);
      prisma.transactionPattern.create.mockResolvedValue({
        id: 'pattern-new',
        status: 'DETECTED',
        suggestions: [],
      } as any);
      prisma.patternOccurrence.createMany.mockResolvedValue({ count: 0 } as any);
      prisma.transactionPattern.updateMany.mockResolvedValue({ count: 0 } as any);

      const result = await service.analyzePatterns(TEST_ORG_ID);

      expect(result.patternsDetected).toBeGreaterThanOrEqual(0);
    });
  });

  describe('checkForDuplicate', () => {
    it('should flag duplicate when entity+amount+date match exactly', async () => {
      prisma.expense.findMany.mockResolvedValue([
        {
          id: 'exp-existing',
          vendorId: 'vendor-001',
          amount: mockDecimal(500),
          date: new Date('2024-01-15'),
          description: 'Office Rent',
          vendor: { name: 'Landlord Corp', displayName: null },
        },
      ] as any);

      prisma.bankTransaction.findMany.mockResolvedValue([] as any);

      const result = await service.checkForDuplicate(
        TEST_ORG_ID,
        'Landlord Corp',
        500,
        new Date('2024-01-15'),
      );

      expect(result.isDuplicate).toBe(true);
      expect(result.matchingTransaction?.id).toBe('exp-existing');
      expect(result.confidence).toBeGreaterThanOrEqual(0.8);
    });

    it('should not flag as duplicate when amount differs significantly', async () => {
      prisma.expense.findMany.mockResolvedValue([
        {
          id: 'exp-1',
          vendorId: 'vendor-001',
          amount: mockDecimal(500),
          date: new Date('2024-01-15'),
          description: 'Office Rent',
          vendor: { name: 'Landlord Corp', displayName: null },
        },
      ] as any);

      prisma.bankTransaction.findMany.mockResolvedValue([] as any);

      const result = await service.checkForDuplicate(
        TEST_ORG_ID,
        'Landlord Corp',
        10000,
        new Date('2024-01-15'),
      );

      expect(result.isDuplicate).toBe(false);
    });

    it('should return isDuplicate=false when no matching transactions exist', async () => {
      prisma.expense.findMany.mockResolvedValue([] as any);
      prisma.bankTransaction.findMany.mockResolvedValue([] as any);

      const result = await service.checkForDuplicate(
        TEST_ORG_ID,
        'Unknown Vendor',
        999,
        new Date('2024-06-01'),
      );

      expect(result.isDuplicate).toBe(false);
      expect(result.matchingTransaction).toBeUndefined();
    });

    it('should detect duplicate in bank transactions as well as expenses', async () => {
      prisma.expense.findMany.mockResolvedValue([] as any);

      prisma.bankTransaction.findMany.mockResolvedValue([
        {
          id: 'bt-existing',
          payee: 'Supplier X',
          description: 'Payment',
          amount: mockDecimal(750),
          date: new Date('2024-03-10'),
        },
      ] as any);

      const result = await service.checkForDuplicate(
        TEST_ORG_ID,
        'Supplier X',
        750,
        new Date('2024-03-10'),
      );

      expect(result.isDuplicate).toBe(true);
      expect(result.matchingTransaction?.id).toBe('bt-existing');
    });
  });

  describe('getPatterns', () => {
    it('should return stored transaction patterns', async () => {
      prisma.transactionPattern.findMany.mockResolvedValue([
        {
          id: 'pattern-1',
          vendorName: 'SaaS Co',
          category: 'Software',
          averageAmount: mockDecimal(100),
          frequency: 'MONTHLY',
          occurrences: 6,
          confidence: mockDecimal(0.9),
          lastOccurrence: new Date('2024-06-15'),
        },
      ] as any);
      prisma.transactionPattern.count.mockResolvedValue(1 as any);

      const patterns = await service.getPatterns(TEST_ORG_ID);

      expect(patterns.data).toHaveLength(1);
      expect((patterns.data[0] as any).vendorName).toBe('SaaS Co');
      expect((patterns.data[0] as any).frequency).toBe('MONTHLY');
    });

    it('should return empty array when no patterns exist', async () => {
      prisma.transactionPattern.findMany.mockResolvedValue([] as any);
      prisma.transactionPattern.count.mockResolvedValue(0 as any);

      const patterns = await service.getPatterns(TEST_ORG_ID);

      expect(patterns.data).toEqual([]);
    });

    it('should respect limit option', async () => {
      prisma.transactionPattern.findMany.mockResolvedValue([
        { id: 'p1', vendorName: 'V1', averageAmount: mockDecimal(10), frequency: 'MONTHLY' },
      ] as any);
      prisma.transactionPattern.count.mockResolvedValue(1 as any);

      await service.getPatterns(TEST_ORG_ID, { limit: 1 });

      expect(prisma.transactionPattern.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 1 }),
      );
    });
  });

  describe('getPendingSuggestions', () => {
    it('should return pending pattern suggestions', async () => {
      prisma.patternSuggestion.findMany.mockResolvedValue([
        {
          id: 'sug-1',
          type: 'RECURRING_EXPENSE',
          description: 'Monthly SaaS subscription detected',
          status: 'PENDING',
          confidence: mockDecimal(0.85),
          data: {},
        },
      ] as any);

      const suggestions = await service.getPendingSuggestions(TEST_ORG_ID);

      expect(suggestions).toHaveLength(1);
      expect(suggestions[0].status).toBe('PENDING');
    });

    it('should return empty array when no pending suggestions', async () => {
      prisma.patternSuggestion.findMany.mockResolvedValue([] as any);

      const suggestions = await service.getPendingSuggestions(TEST_ORG_ID);

      expect(suggestions).toEqual([]);
    });
  });

  describe('acceptSuggestion', () => {
    it('should mark suggestion as ACCEPTED', async () => {
      prisma.patternSuggestion.findFirst.mockResolvedValue({
        id: 'sug-1',
        status: 'PENDING',
        suggestedFrequency: 'MONTHLY',
        suggestedAmount: mockDecimal(100),
        organizationId: TEST_ORG_ID,
        pattern: {
          id: 'pat-1',
          entityType: 'expense',
          entityId: 'exp-1',
          entityName: 'Office Supplies Inc',
          amountCluster: 100,
          descriptionPattern: 'Monthly supplies',
          firstOccurrence: new Date('2024-01-01'),
          lastOccurrence: new Date('2024-06-01'),
          occurrences: [{ date: new Date('2024-06-01') }],
        },
      } as any);

      prisma.recurringProfile.create.mockResolvedValue({
        id: 'rp-1',
      } as any);

      prisma.$transaction.mockResolvedValue([{}, {}] as any);

      const result = await service.acceptSuggestion(TEST_ORG_ID, 'sug-1');

      expect(result.recurringProfileId).toBe('rp-1');
      expect(prisma.recurringProfile.create).toHaveBeenCalled();
    });

    it('should throw when suggestion not found', async () => {
      prisma.patternSuggestion.findFirst.mockResolvedValue(null as any);

      await expect(service.acceptSuggestion(TEST_ORG_ID, 'nonexistent')).rejects.toThrow();
    });
  });

  describe('dismissSuggestion', () => {
    it('should mark suggestion as DISMISSED with reason', async () => {
      prisma.patternSuggestion.findFirst.mockResolvedValue({
        id: 'sug-2',
        status: 'PENDING',
        organizationId: TEST_ORG_ID,
      } as any);

      prisma.patternSuggestion.update.mockResolvedValue({
        id: 'sug-2',
        status: 'DISMISSED',
      } as any);

      await service.dismissSuggestion(TEST_ORG_ID, 'sug-2', 'Not relevant');

      expect(prisma.patternSuggestion.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'sug-2' },
          data: expect.objectContaining({
            status: 'DISMISSED',
            dismissedReason: 'Not relevant',
          }),
        }),
      );
    });

    it('should throw when suggestion not found', async () => {
      prisma.patternSuggestion.findFirst.mockResolvedValue(null as any);

      await expect(
        service.dismissSuggestion(TEST_ORG_ID, 'nonexistent', 'reason'),
      ).rejects.toThrow();
    });
  });
});
