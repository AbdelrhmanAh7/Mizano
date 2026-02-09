import { SetMetadata } from '@nestjs/common';

export const CACHE_TTL_KEY = 'cacheTtlSeconds';

/**
 * Override the default cache TTL for a specific endpoint (in seconds).
 *
 * @param seconds - TTL in seconds (e.g. 300 = 5 minutes, 600 = 10 minutes)
 */
export const CacheTTL = (seconds: number) => SetMetadata(CACHE_TTL_KEY, seconds);
