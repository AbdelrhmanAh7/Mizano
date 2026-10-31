import { SetMetadata } from '@nestjs/common';

export const HTTP_CACHE_KEY = 'httpCacheControl';

export type HttpCacheProfile = 'static' | 'short' | 'realtime';

/**
 * Sets HTTP Cache-Control headers on GET responses.
 *
 * Profiles (see CACHE_PROFILES in http-cache.interceptor):
 * - 'static':   private, no-cache (reference data: accounts, tax rates, roles; ETag/304)
 * - 'short':    private, no-cache (lists: invoices, customers, vendors; ETag/304)
 * - 'realtime': private, no-cache, no-store (notifications, real-time data)
 *
 * Users edit all of this data, so nothing may be served from a cache without revalidation.
 */
export const HttpCache = (profile: HttpCacheProfile) => SetMetadata(HTTP_CACHE_KEY, profile);
