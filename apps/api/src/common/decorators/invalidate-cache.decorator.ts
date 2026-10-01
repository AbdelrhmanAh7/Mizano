import { SetMetadata } from '@nestjs/common';

export const INVALIDATE_CACHE_KEY = 'invalidateCachePatterns';

/**
 * Marks a write endpoint (POST/PUT/PATCH/DELETE) with cache patterns
 * that should be invalidated after a successful response.
 *
 * Patterns support Redis glob syntax:
 *   - 'dashboard:*'        → all dashboard keys
 *   - 'reports:*'          → all report keys
 *   - 'accounts:list'      → exact key prefix
 *   - 'accounts:*'         → all account keys
 *
 * The interceptor will call CacheService.deletePattern() for each pattern,
 * scoped to the current organization.
 *
 * @param patterns - One or more cache key patterns to invalidate
 */
export const InvalidateCache = (...patterns: string[]) =>
  SetMetadata(INVALIDATE_CACHE_KEY, patterns);

/** Caches derived from the posted ledger. Any endpoint that posts or reverses a journal must clear them. */
export const LEDGER_CACHE_PATTERNS = ['journals:*', 'accounts:*', 'reports:*', 'dashboard:*'];

/**
 * {@link InvalidateCache} for endpoints that post to the ledger: clears the given module patterns
 * plus every ledger-derived cache. Use one decorator per handler (a second one overrides the first).
 */
export const InvalidatesLedger = (...patterns: string[]) =>
  InvalidateCache(...new Set([...patterns, ...LEDGER_CACHE_PATTERNS]));
