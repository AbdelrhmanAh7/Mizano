import { Test, TestingModule } from '@nestjs/testing';
import { ComplianceMonitoringService } from './compliance-monitoring.service';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  createMockPrisma,
  MockPrismaClient,
  TEST_ORG_ID,
  mockDecimal,
} from '../__tests__/fixtures/ai-test-helpers';

describe('ComplianceMonitoringService', () => {
  let service: ComplianceMonitoringService;
  let prisma: MockPrismaClient;

  const orgId = TEST_ORG_ID;

  beforeEach(async () => {
    prisma = createMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [ComplianceMonitoringService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<ComplianceMonitoringService>(ComplianceMonitoringService);
  });

  // ---------------------------------------------------------------------------
  // runComplianceCheck
  // ---------------------------------------------------------------------------
  describe('runComplianceCheck', () => {
    it('should return a clean report when no violations exist', async () => {
      prisma.journal.findMany.mockResolvedValue([] as any);
      prisma.invoice.findMany.mockResolvedValue([] as any);
      prisma.auditLog.findMany.mockResolvedValue([] as any);
      prisma.vATReturn.findMany.mockResolvedValue([] as any);

      const report = await service.runComplianceCheck(orgId);

      expect(report.score).toBe(100);
      expect(report.totalChecks).toBe(5);
      expect(report.passed).toBe(5);
      expect(report.violations).toHaveLength(0);
      expect(report.checkedAt).toBeInstanceOf(Date);
    });

    it('should aggregate violations from all checks', async () => {
      // Unbalanced journal
      prisma.journal.findMany.mockResolvedValue([
        {
          id: 'jrn-1',
          journalNumber: 'JRN-001',
          lines: [
            { debit: mockDecimal(1000), credit: mockDecimal(0) },
            { debit: mockDecimal(0), credit: mockDecimal(500) },
          ],
          date: new Date(),
          createdAt: new Date(),
        },
      ] as any);
      // Paid invoice without payments
      prisma.invoice.findMany.mockResolvedValue([{ id: 'inv-1', invoiceNumber: 'INV-001' }] as any);
      prisma.auditLog.findMany.mockResolvedValue([] as any);
      prisma.vATReturn.findMany.mockResolvedValue([] as any);

      const report = await service.runComplianceCheck(orgId);

      expect(report.violations.length).toBeGreaterThan(0);
      expect(report.score).toBeLessThan(100);
      expect(report.passed).toBeLessThan(5);
    });

    it('should have checkedAt set to current time', async () => {
      prisma.journal.findMany.mockResolvedValue([] as any);
      prisma.invoice.findMany.mockResolvedValue([] as any);
      prisma.auditLog.findMany.mockResolvedValue([] as any);
      prisma.vATReturn.findMany.mockResolvedValue([] as any);

      const before = new Date();
      const report = await service.runComplianceCheck(orgId);
      const after = new Date();

      expect(report.checkedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(report.checkedAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });

  // ---------------------------------------------------------------------------
  // checkJournalBalance
  // ---------------------------------------------------------------------------
  describe('checkJournalBalance', () => {
    it('should return no violations for balanced journals', async () => {
      prisma.journal.findMany.mockResolvedValue([
        {
          id: 'jrn-1',
          journalNumber: 'JRN-001',
          lines: [
            { debit: mockDecimal(1000), credit: mockDecimal(0) },
            { debit: mockDecimal(0), credit: mockDecimal(1000) },
          ],
        },
      ] as any);

      const violations = await service.checkJournalBalance(orgId);

      expect(violations).toHaveLength(0);
    });

    it('should flag unbalanced journal with CRITICAL severity', async () => {
      prisma.journal.findMany.mockResolvedValue([
        {
          id: 'jrn-bad',
          journalNumber: 'JRN-BAD',
          lines: [
            { debit: mockDecimal(1000), credit: mockDecimal(0) },
            { debit: mockDecimal(0), credit: mockDecimal(800) },
          ],
        },
      ] as any);

      const violations = await service.checkJournalBalance(orgId);

      expect(violations).toHaveLength(1);
      expect(violations[0].type).toBe('unbalanced_journal');
      expect(violations[0].severity).toBe('CRITICAL');
      expect(violations[0].entityType).toBe('journal');
      expect(violations[0].entityId).toBe('jrn-bad');
      expect(violations[0].description).toContain('200.00');
    });

    it('should ignore rounding differences <= 0.01', async () => {
      prisma.journal.findMany.mockResolvedValue([
        {
          id: 'jrn-tiny',
          journalNumber: 'JRN-TINY',
          lines: [
            { debit: mockDecimal(100.005), credit: mockDecimal(0) },
            { debit: mockDecimal(0), credit: mockDecimal(100) },
          ],
        },
      ] as any);

      const violations = await service.checkJournalBalance(orgId);

      expect(violations).toHaveLength(0);
    });

    it('should handle journals with multiple lines correctly', async () => {
      prisma.journal.findMany.mockResolvedValue([
        {
          id: 'jrn-multi',
          journalNumber: 'JRN-MULTI',
          lines: [
            { debit: mockDecimal(500), credit: mockDecimal(0) },
            { debit: mockDecimal(500), credit: mockDecimal(0) },
            { debit: mockDecimal(0), credit: mockDecimal(300) },
            { debit: mockDecimal(0), credit: mockDecimal(700) },
          ],
        },
      ] as any);

      const violations = await service.checkJournalBalance(orgId);

      expect(violations).toHaveLength(0);
    });

    it('should return empty array for org with no journals', async () => {
      prisma.journal.findMany.mockResolvedValue([] as any);

      const violations = await service.checkJournalBalance(orgId);

      expect(violations).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  // checkMissingReferences
  // ---------------------------------------------------------------------------
  describe('checkMissingReferences', () => {
    it('should flag paid invoices without payment allocations', async () => {
      prisma.invoice.findMany.mockResolvedValue([
        { id: 'inv-001', invoiceNumber: 'INV-001' },
      ] as any);

      const violations = await service.checkMissingReferences(orgId);

      expect(violations).toHaveLength(1);
      expect(violations[0].type).toBe('missing_payment_reference');
      expect(violations[0].severity).toBe('HIGH');
    });

    it('should return empty when no paid invoices lack payment records', async () => {
      prisma.invoice.findMany.mockResolvedValue([] as any);

      const violations = await service.checkMissingReferences(orgId);

      expect(violations).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  // checkBackdatedTransactions
  // ---------------------------------------------------------------------------
  describe('checkBackdatedTransactions', () => {
    it('should flag journals backdated by more than 30 days', async () => {
      const now = new Date();
      const ninetyDaysAgo = new Date(now.getTime() - 90 * 86400000);

      prisma.journal.findMany.mockResolvedValue([
        {
          id: 'jrn-old',
          journalNumber: 'JRN-OLD',
          date: ninetyDaysAgo,
          createdAt: now,
        },
      ] as any);

      const violations = await service.checkBackdatedTransactions(orgId);

      expect(violations).toHaveLength(1);
      expect(violations[0].type).toBe('backdated_transaction');
      expect(violations[0].entityId).toBe('jrn-old');
    });

    it('should assign HIGH severity for journals backdated > 90 days', async () => {
      const now = new Date();
      const longAgo = new Date(now.getTime() - 120 * 86400000);

      prisma.journal.findMany.mockResolvedValue([
        {
          id: 'jrn-very-old',
          journalNumber: 'JRN-VOLD',
          date: longAgo,
          createdAt: now,
        },
      ] as any);

      const violations = await service.checkBackdatedTransactions(orgId);

      expect(violations).toHaveLength(1);
      expect(violations[0].severity).toBe('HIGH');
    });

    it('should not flag journals backdated by less than 30 days', async () => {
      const now = new Date();
      const tenDaysAgo = new Date(now.getTime() - 10 * 86400000);

      prisma.journal.findMany.mockResolvedValue([
        {
          id: 'jrn-recent',
          journalNumber: 'JRN-REC',
          date: tenDaysAgo,
          createdAt: now,
        },
      ] as any);

      const violations = await service.checkBackdatedTransactions(orgId);

      expect(violations).toHaveLength(0);
    });

    it('should return empty for org with no recent journals', async () => {
      prisma.journal.findMany.mockResolvedValue([] as any);

      const violations = await service.checkBackdatedTransactions(orgId);

      expect(violations).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  // getComplianceScore
  // ---------------------------------------------------------------------------
  describe('getComplianceScore', () => {
    it('should return 100 overall score for a clean organization', async () => {
      prisma.journal.findMany.mockResolvedValue([] as any);
      prisma.invoice.findMany.mockResolvedValue([] as any);
      prisma.auditLog.findMany.mockResolvedValue([] as any);
      prisma.vATReturn.findMany.mockResolvedValue([] as any);

      const result = await service.getComplianceScore(orgId);

      expect(result.overallScore).toBe(100);
      expect(result.categories).toHaveLength(5);
      result.categories.forEach((cat) => {
        expect(cat.score).toBe(100);
        expect(cat.violations).toBe(0);
      });
    });

    it('should reduce category scores when violations exist', async () => {
      // Return an unbalanced journal
      prisma.journal.findMany.mockResolvedValue([
        {
          id: 'jrn-bad',
          journalNumber: 'JRN-BAD',
          lines: [
            { debit: mockDecimal(1000), credit: mockDecimal(0) },
            { debit: mockDecimal(0), credit: mockDecimal(500) },
          ],
          date: new Date(),
          createdAt: new Date(),
        },
      ] as any);
      prisma.invoice.findMany.mockResolvedValue([] as any);
      prisma.auditLog.findMany.mockResolvedValue([] as any);
      prisma.vATReturn.findMany.mockResolvedValue([] as any);

      const result = await service.getComplianceScore(orgId);

      expect(result.overallScore).toBeLessThan(100);
      const journalCat = result.categories.find((c) => c.category === 'Journal Integrity');
      expect(journalCat).toBeDefined();
      expect(journalCat!.violations).toBeGreaterThan(0);
      expect(journalCat!.score).toBeLessThan(100);
    });
  });
});
