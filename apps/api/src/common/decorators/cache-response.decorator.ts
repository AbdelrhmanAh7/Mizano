import { SetMetadata } from '@nestjs/common';

export const CACHE_RESPONSE_KEY = 'cacheResponsePrefix';

/**
 * Marks a GET endpoint for automatic response caching.
 * The interceptor builds the full cache key from:
 *   org:{organizationId}:{prefix}:{hash(queryParams)}
 *
 * @param prefix - Cache key prefix, e.g. 'dashboard', 'reports:pnl', 'accounts:list'
 */
export const CacheResponse = (prefix: string) => SetMetadata(CACHE_RESPONSE_KEY, prefix);
