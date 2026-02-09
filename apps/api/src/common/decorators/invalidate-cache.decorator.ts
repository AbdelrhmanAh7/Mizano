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
