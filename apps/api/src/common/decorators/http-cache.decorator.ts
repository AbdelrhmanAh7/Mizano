import { SetMetadata } from '@nestjs/common';

export const HTTP_CACHE_KEY = 'httpCacheControl';

export type HttpCacheProfile = 'static' | 'short' | 'realtime';

/**
 * Sets HTTP Cache-Control headers on GET responses.
 *
 * Profiles:
 * - 'static':   public, max-age=3600, stale-while-revalidate=300
 *               (reference data: accounts, tax rates, roles)
 * - 'short':    private, max-age=30, stale-while-revalidate=60
 *               (user-specific lists: invoices, customers, vendors)
 * - 'realtime': private, no-cache, no-store
 *               (notifications, real-time data)
 */
export const HttpCache = (profile: HttpCacheProfile) => SetMetadata(HTTP_CACHE_KEY, profile);
