import { Injectable, Logger } from '@nestjs/common';
import { globalQueryMetricsBuffer } from '../../../prisma/prisma-query.middleware';
import { IndexRecommendationDto } from '../dto/query-metrics.dto';

/**
 * Known indexes already in the Prisma schema.
 * This map is used to avoid recommending indexes that already exist.
 * Updated to reflect the latest schema with composite indexes.
 */
const EXISTING_INDEXES: Record<string, string[][]> = {
  Invoice: [
    ['organizationId'],
    ['customerId'],
    ['status'],
    ['dueDate'],
    ['organizationId', 'status'],
    ['organizationId', 'customerId'],
    ['organizationId', 'dueDate'],
    ['organizationId', 'deletedAt', 'status', 'date'],
    ['organizationId', 'deletedAt', 'balanceDue'],
  ],
  Bill: [
    ['organizationId'],
    ['vendorId'],
    ['status'],
    ['dueDate'],
    ['organizationId', 'status'],
    ['organizationId', 'vendorId'],
    ['organizationId', 'dueDate'],
    ['organizationId', 'deletedAt', 'status', 'date'],
    ['organizationId', 'deletedAt', 'balanceDue'],
  ],
  Journal: [
    ['organizationId'],
    ['date'],
    ['organizationId', 'deletedAt', 'date'],
    ['organizationId', 'isPosted', 'date'],
  ],
  JournalLine: [['journalId'], ['accountId'], ['accountId', 'journalId']],
  Expense: [
    ['organizationId'],
    ['date'],
    ['organizationId', 'status'],
    ['organizationId', 'vendorId'],
    ['organizationId', 'deletedAt', 'date'],
    ['organizationId', 'deletedAt', 'status'],
  ],
  Item: [['organizationId'], ['type'], ['organizationId', 'deletedAt']],
  BankTransaction: [
    ['organizationId'],
    ['bankAccountId'],
    ['status'],
    ['date'],
    ['organizationId', 'status'],
    ['organizationId', 'bankAccountId', 'status'],
  ],
  AuditLog: [
    ['organizationId'],
    ['entityType', 'entityId'],
    ['createdAt'],
    ['organizationId', 'entityType', 'entityId'],
    ['organizationId', 'createdAt'],
    ['organizationId', 'userId', 'createdAt'],
  ],
  Account: [['organizationId'], ['type']],
  Customer: [['organizationId'], ['name']],
  Vendor: [['organizationId'], ['name']],
};

// Prisma model → Postgres table name mapping
const MODEL_TO_TABLE: Record<string, string> = {
  Invoice: 'invoices',
  Bill: 'bills',
  Journal: 'journals',
  JournalLine: 'journal_lines',
  Expense: 'expenses',
  Item: 'items',
  BankTransaction: 'bank_transactions',
  AuditLog: 'audit_logs',
  Account: 'accounts',
  Customer: 'customers',
  Vendor: 'vendors',
  Quote: 'quotes',
  CreditNote: 'credit_notes',
  PaymentReceived: 'payments_received',
  PaymentMade: 'payments_made',
  InventoryMovement: 'inventory_movements',
  InventoryLevel: 'inventory_levels',
  Reconciliation: 'reconciliations',
  Employee: 'employees',
  Project: 'projects',
  Task: 'tasks',
};

@Injectable()
export class IndexAdvisorService {
  private readonly logger = new Logger(IndexAdvisorService.name);

  /**
   * Analyze slow query patterns and recommend indexes.
   * Uses frequency analysis and heuristic scoring (count × avgDuration = impact).
   * Results are filtered against known existing indexes.
   */
  getRecommendations(): IndexRecommendationDto[] {
    const entries = globalQueryMetricsBuffer.getAll();
    if (entries.length === 0) {
      return [];
    }

    // Analyze model frequency and slow patterns
    const modelStats = new Map<
      string,
      { count: number; totalDuration: number; slowCount: number; actions: Map<string, number> }
    >();

    for (const entry of entries) {
      const existing = modelStats.get(entry.model);
      if (existing) {
        existing.count++;
        existing.totalDuration += entry.duration;
        if (entry.isSlow) existing.slowCount++;
        existing.actions.set(entry.action, (existing.actions.get(entry.action) || 0) + 1);
      } else {
        const actions = new Map<string, number>();
        actions.set(entry.action, 1);
        modelStats.set(entry.model, {
          count: 1,
          totalDuration: entry.duration,
          slowCount: entry.isSlow ? 1 : 0,
          actions,
        });
      }
    }

    const recommendations: IndexRecommendationDto[] = [];

    for (const [model, stats] of modelStats.entries()) {
      if (stats.slowCount === 0 && stats.count < 100) continue;

      const avgDuration = stats.totalDuration / stats.count;
      const impactScore = Math.round(stats.slowCount * avgDuration);
      const tableName = MODEL_TO_TABLE[model] || model.toLowerCase() + 's';

      // Check which common index patterns are missing for this model
      const existingForModel = EXISTING_INDEXES[model] || [];

      // Heuristic: recommend organizationId + common filter columns
      const findManyCount = stats.actions.get('findMany') || 0;
      const aggregateCount = stats.actions.get('aggregate') || 0;
      const groupByCount = stats.actions.get('groupBy') || 0;
      const readHeavy = findManyCount + aggregateCount + groupByCount;

      // If this model has many reads and slow queries, suggest common patterns
      if (readHeavy > 10 && stats.slowCount > 0) {
        // Check if organizationId + createdAt composite exists
        const hasOrgCreatedAt = existingForModel.some(
          (idx) => idx.length >= 2 && idx[0] === 'organizationId' && idx.includes('createdAt'),
        );

        if (!hasOrgCreatedAt && impactScore > 50) {
          recommendations.push({
            table: tableName,
            columns: ['organizationId', 'createdAt'],
            reason: `Model "${model}" has ${stats.slowCount} slow queries out of ${stats.count} total. Adding a composite index on (organizationId, createdAt) would accelerate filtered listing queries.`,
            estimatedImpact: impactScore,
            suggestedSQL: `CREATE INDEX CONCURRENTLY idx_${tableName}_org_created ON "${tableName}" ("organizationId", "createdAt");`,
          });
        }
      }

      // If aggregation queries are slow, suggest an index for the most queried action
      if (aggregateCount + groupByCount > 5 && avgDuration > 200) {
        const hasOrgDate = existingForModel.some(
          (idx) =>
            idx.length >= 2 &&
            idx[0] === 'organizationId' &&
            (idx.includes('date') || idx.includes('createdAt')),
        );

        if (!hasOrgDate) {
          recommendations.push({
            table: tableName,
            columns: ['organizationId', 'date'],
            reason: `Model "${model}" has ${aggregateCount + groupByCount} aggregation/groupBy queries with avg ${Math.round(avgDuration)}ms. A date-based composite index would improve report performance.`,
            estimatedImpact: Math.round(impactScore * 1.5),
            suggestedSQL: `CREATE INDEX CONCURRENTLY idx_${tableName}_org_date ON "${tableName}" ("organizationId", "date");`,
          });
        }
      }

      // Generic: high slow-query count without specific pattern
      if (
        stats.slowCount > 5 &&
        recommendations.filter((r) => r.table === tableName).length === 0
      ) {
        recommendations.push({
          table: tableName,
          columns: ['organizationId'],
          reason: `Model "${model}" has ${stats.slowCount} slow queries (avg ${Math.round(avgDuration)}ms). Review query patterns and consider adding targeted composite indexes.`,
          estimatedImpact: impactScore,
          suggestedSQL: `-- Review WHERE clauses on "${tableName}" and add targeted composite indexes`,
        });
      }
    }

    // Sort by impact score descending
    recommendations.sort((a, b) => b.estimatedImpact - a.estimatedImpact);

    return recommendations.slice(0, 20); // Top 20 recommendations
  }
}
