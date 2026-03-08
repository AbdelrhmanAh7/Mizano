import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

export interface ComplianceViolation {
  type: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  entityType: string;
  entityId: string;
  description: string;
  recommendation: string;
}

export interface ComplianceReport {
  score: number;
  totalChecks: number;
  passed: number;
  violations: ComplianceViolation[];
  checkedAt: Date;
}

export interface ComplianceScoreResult {
  overallScore: number;
  categories: {
    category: string;
    score: number;
    checks: number;
    violations: number;
  }[];
}

@Injectable()
export class ComplianceMonitoringService {
  private readonly logger = new Logger(ComplianceMonitoringService.name);

  constructor(private prisma: PrismaService) {}

  async runComplianceCheck(organizationId: string): Promise<ComplianceReport> {
    const violations: ComplianceViolation[] = [];

    const [
      balanceViolations,
      referenceViolations,
      sodViolations,
      filingViolations,
      backdateViolations,
    ] = await Promise.all([
      this.checkJournalBalance(organizationId),
      this.checkMissingReferences(organizationId),
      this.checkSegregationOfDuties(organizationId),
      this.checkRegulatoryFilings(organizationId),
      this.checkBackdatedTransactions(organizationId),
    ]);

    violations.push(
      ...balanceViolations,
      ...referenceViolations,
      ...sodViolations,
      ...filingViolations,
      ...backdateViolations,
    );

    const totalChecks = 5;
    const passed = [
      balanceViolations,
      referenceViolations,
      sodViolations,
      filingViolations,
      backdateViolations,
    ].filter((v) => v.length === 0).length;

    const score = totalChecks > 0 ? (passed / totalChecks) * 100 : 100;

    return {
      score,
      totalChecks,
      passed,
      violations,
      checkedAt: new Date(),
    };
  }

  async checkJournalBalance(organizationId: string): Promise<ComplianceViolation[]> {
    const violations: ComplianceViolation[] = [];

    // Find journals where debits != credits
    const journals = await this.prisma.journal.findMany({
      where: { organizationId, deletedAt: null },
      select: {
        id: true,
        journalNumber: true,
        lines: { select: { debit: true, credit: true } },
      },
      take: 500,
      orderBy: { createdAt: 'desc' },
    });

    for (const journal of journals) {
      const totalDebits = journal.lines.reduce((sum, l) => sum + Number(l.debit), 0);
      const totalCredits = journal.lines.reduce((sum, l) => sum + Number(l.credit), 0);
      const diff = Math.abs(totalDebits - totalCredits);

      if (diff > 0.01) {
        violations.push({
          type: 'unbalanced_journal',
          severity: 'CRITICAL',
          entityType: 'journal',
          entityId: journal.id,
          description: `Journal ${journal.journalNumber} is unbalanced by ${diff.toFixed(2)} (debits: ${totalDebits.toFixed(2)}, credits: ${totalCredits.toFixed(2)})`,
          recommendation: 'Review and correct journal entry to ensure debits equal credits',
        });
      }
    }

    return violations;
  }

  async checkMissingReferences(organizationId: string): Promise<ComplianceViolation[]> {
    const violations: ComplianceViolation[] = [];

    // Paid invoices without payment records
    const paidInvoicesWithoutPayments = await this.prisma.invoice.findMany({
      where: {
        organizationId,
        status: 'PAID',
        deletedAt: null,
        paymentAllocations: { none: {} },
      },
      select: { id: true, invoiceNumber: true },
      take: 50,
    });

    for (const inv of paidInvoicesWithoutPayments) {
      violations.push({
        type: 'missing_payment_reference',
        severity: 'HIGH',
        entityType: 'invoice',
        entityId: inv.id,
        description: `Invoice ${inv.invoiceNumber} marked as PAID but has no payment records`,
        recommendation: 'Record the payment received or correct the invoice status',
      });
    }

    // Bills without journal entries
    // Note: Bill model has no direct journal relation, so we check for bills
    // that have no corresponding journal via audit trail or other means
    // For now, this check is a no-op since Bill has no journalId field

    return violations;
  }

  async checkSegregationOfDuties(organizationId: string): Promise<ComplianceViolation[]> {
    const violations: ComplianceViolation[] = [];
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);

    // Check if same user created and modified financial entities
    const auditLogs = await this.prisma.auditLog.findMany({
      where: {
        organizationId,
        createdAt: { gte: thirtyDaysAgo },
        entityType: { in: ['journal', 'invoice', 'bill', 'expense', 'payment'] },
      },
      select: {
        userId: true,
        entityType: true,
        entityId: true,
        action: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 1000,
    });

    // Group by entity
    const entityActions = new Map<string, Map<string, Set<string>>>();
    for (const log of auditLogs) {
      const key = `${log.entityType}:${log.entityId}`;
      if (!entityActions.has(key)) entityActions.set(key, new Map());
      const userActions = entityActions.get(key)!;
      if (!userActions.has(log.userId)) userActions.set(log.userId, new Set());
      userActions.get(log.userId)!.add(log.action);
    }

    // Check for same user performing both CREATE and UPDATE/APPROVE
    for (const [key, userActions] of entityActions) {
      for (const [_userId, actions] of userActions) {
        if (actions.has('CREATE') && (actions.has('UPDATE') || actions.has('APPROVE'))) {
          const [entityType, entityId] = key.split(':');
          violations.push({
            type: 'segregation_of_duties',
            severity: 'MEDIUM',
            entityType,
            entityId,
            description: `Same user created and modified/approved ${entityType} ${entityId}`,
            recommendation:
              'Ensure different users handle creation and approval of financial records',
          });
        }
      }
    }

    return violations.slice(0, 20); // Limit results
  }

  async checkRegulatoryFilings(organizationId: string): Promise<ComplianceViolation[]> {
    const violations: ComplianceViolation[] = [];
    const now = new Date();

    const overdueReturns = await this.prisma.vATReturn.findMany({
      where: {
        organizationId,
        status: { in: ['DRAFT', 'CALCULATED'] },
        periodEnd: { lt: now },
      },
      select: { id: true, periodStart: true, periodEnd: true, status: true },
    });

    for (const ret of overdueReturns) {
      if (!ret.periodEnd) continue;
      const daysPast = Math.floor((now.getTime() - ret.periodEnd.getTime()) / 86400000);
      violations.push({
        type: 'overdue_filing',
        severity: daysPast > 30 ? 'CRITICAL' : 'HIGH',
        entityType: 'vat_return',
        entityId: ret.id,
        description: `VAT return for period ending ${ret.periodEnd.toISOString().split('T')[0]} is ${daysPast} days overdue`,
        recommendation: 'File the VAT return immediately to avoid penalties',
      });
    }

    return violations;
  }

  async checkBackdatedTransactions(organizationId: string): Promise<ComplianceViolation[]> {
    const violations: ComplianceViolation[] = [];

    // Find journals where date is significantly before createdAt
    const journals = await this.prisma.journal.findMany({
      where: {
        organizationId,
        deletedAt: null,
        createdAt: { gte: new Date(Date.now() - 90 * 86400000) },
      },
      select: { id: true, journalNumber: true, date: true, createdAt: true },
      take: 500,
    });

    for (const journal of journals) {
      const daysDiff = Math.floor(
        (journal.createdAt.getTime() - journal.date.getTime()) / 86400000,
      );
      if (daysDiff > 30) {
        violations.push({
          type: 'backdated_transaction',
          severity: daysDiff > 90 ? 'HIGH' : 'MEDIUM',
          entityType: 'journal',
          entityId: journal.id,
          description: `Journal ${journal.journalNumber} is backdated by ${daysDiff} days`,
          recommendation: 'Review backdated entry for accuracy and add justification note',
        });
      }
    }

    return violations;
  }

  async getComplianceScore(organizationId: string): Promise<ComplianceScoreResult> {
    const report = await this.runComplianceCheck(organizationId);

    const categories = [
      {
        category: 'Journal Integrity',
        violations: report.violations.filter((v) => v.type === 'unbalanced_journal'),
      },
      {
        category: 'Reference Completeness',
        violations: report.violations.filter((v) => v.type.includes('missing_')),
      },
      {
        category: 'Segregation of Duties',
        violations: report.violations.filter((v) => v.type === 'segregation_of_duties'),
      },
      {
        category: 'Regulatory Filings',
        violations: report.violations.filter((v) => v.type === 'overdue_filing'),
      },
      {
        category: 'Transaction Dating',
        violations: report.violations.filter((v) => v.type === 'backdated_transaction'),
      },
    ];

    return {
      overallScore: report.score,
      categories: categories.map((cat) => ({
        category: cat.category,
        score: cat.violations.length === 0 ? 100 : Math.max(0, 100 - cat.violations.length * 10),
        checks: 1,
        violations: cat.violations.length,
      })),
    };
  }
}
