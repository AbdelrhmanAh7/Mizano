import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { CacheInvalidatedEvent } from '../common/interceptors/cache-invalidation.interceptor';
import { CacheService } from './cache.service';

/**
 * Cross-module cache invalidation matrix.
 *
 * When a write in module X invalidates its own patterns, this listener
 * ensures dependent caches in other modules are also purged.
 *
 * For example, creating a journal entry invalidates 'journals:*',
 * but must also invalidate 'dashboard:*' and 'reports:*'.
 */
const CROSS_MODULE_INVALIDATION_MAP: Record<string, string[]> = {
  // Accounting writes → invalidate dashboard + reports
  'accounts:*': ['dashboard:*', 'reports:*'],
  'journals:*': ['dashboard:*', 'reports:*'],

  // Sales writes → invalidate dashboard + revenue/profit reports + AI caches
  'invoices:*': [
    'dashboard:*',
    'reports:pnl:*',
    'reports:sales-*',
    'reports:receivables-*',
    'ai:narrative-monthly:*',
    'ai:narrative-weekly:*',
    'ai:cash-flow:*',
  ],
  'customers:*': ['dashboard:*', 'reports:sales-*'],
  'credit-notes:*': ['dashboard:*', 'reports:*'],
  'payments-received:*': [
    'dashboard:*',
    'reports:cash-flow:*',
    'reports:receivables-*',
    'ai:narrative-monthly:*',
    'ai:narrative-weekly:*',
    'ai:cash-flow:*',
  ],

  // Purchases writes → invalidate dashboard + expense/payables reports + AI caches
  'bills:*': [
    'dashboard:*',
    'reports:pnl:*',
    'reports:purchases-*',
    'reports:payables-*',
    'ai:narrative-monthly:*',
    'ai:narrative-weekly:*',
    'ai:cash-flow:*',
  ],
  'vendors:*': ['dashboard:*', 'reports:purchases-*'],
  'expenses:*': [
    'dashboard:*',
    'reports:pnl:*',
    'reports:expenses-*',
    'ai:narrative-monthly:*',
    'ai:narrative-weekly:*',
  ],
  'payments-made:*': [
    'dashboard:*',
    'reports:cash-flow:*',
    'reports:payables-*',
    'ai:narrative-monthly:*',
    'ai:narrative-weekly:*',
    'ai:cash-flow:*',
  ],
  'vendor-credits:*': ['dashboard:*', 'reports:*'],

  // Banking writes → invalidate dashboard + cash flow
  'bank-accounts:*': ['dashboard:*', 'reports:cash-flow:*'],
  'bank-transactions:*': ['dashboard:*', 'reports:cash-flow:*', 'ai:categorization:*'],
  'reconciliation:*': ['dashboard:*', 'reports:*', 'bank-transactions:*'],

  // Inventory writes → invalidate dashboard + AI demand forecast
  'inventory:*': ['dashboard:*', 'ai:demand-forecast:*'],
};

@Injectable()
export class CacheInvalidationListener {
  private readonly logger = new Logger(CacheInvalidationListener.name);

  constructor(private readonly cacheService: CacheService) {}

  @OnEvent('cache.invalidated')
  async handleCacheInvalidated(event: CacheInvalidatedEvent): Promise<void> {
    const { patterns, organizationId } = event;

    // Collect all additional patterns that need invalidation
    const additionalPatterns = new Set<string>();

    for (const pattern of patterns) {
      const crossPatterns = this.findCrossModulePatterns(pattern);
      for (const cp of crossPatterns) {
        // Don't re-invalidate patterns already handled by the interceptor
        if (!patterns.includes(cp)) {
          additionalPatterns.add(cp);
        }
      }
    }

    if (additionalPatterns.size === 0) {
      return;
    }

    this.logger.debug(
      `Cross-module invalidation: ${[...additionalPatterns].join(', ')} for org ${organizationId}`,
    );

    const deletePromises = [...additionalPatterns].map((pattern) =>
      this.cacheService.deletePattern(pattern, organizationId),
    );

    try {
      const results = await Promise.all(deletePromises);
      const totalDeleted = results.reduce((sum, n) => sum + n, 0);
      if (totalDeleted > 0) {
        this.logger.debug(
          `Cross-module: deleted ${totalDeleted} additional keys for org ${organizationId}`,
        );
      }
    } catch (error) {
      this.logger.warn(`Cross-module cache invalidation error: ${error}`);
    }
  }

  /**
   * Find all cross-module patterns that match a given source pattern.
   * Handles both exact matches and wildcard prefix matches.
   */
  private findCrossModulePatterns(sourcePattern: string): string[] {
    const result: string[] = [];

    for (const [key, dependents] of Object.entries(CROSS_MODULE_INVALIDATION_MAP)) {
      // Check if the source pattern matches or overlaps with the map key
      if (this.patternsOverlap(sourcePattern, key)) {
        result.push(...dependents);
      }
    }

    return result;
  }

  /**
   * Check if two cache patterns have overlapping key spaces.
   * e.g. 'invoices:*' overlaps with 'invoices:*'
   *      'invoices:list' overlaps with 'invoices:*'
   */
  private patternsOverlap(a: string, b: string): boolean {
    // Strip trailing wildcards for prefix comparison
    const prefixA = a.replace(/:\*$/, '').replace(/\*$/, '');
    const prefixB = b.replace(/:\*$/, '').replace(/\*$/, '');

    return prefixA.startsWith(prefixB) || prefixB.startsWith(prefixA);
  }
}
