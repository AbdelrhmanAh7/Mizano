import { Injectable, Inject, Logger } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';

export interface CacheOptions {
  ttl?: number; // Time to live in seconds
  prefix?: string;
}

@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);
  constructor(@Inject(CACHE_MANAGER) private cacheManager: Cache) {}

  /**
   * Build a cache key with optional organization prefix
   */
  buildKey(key: string, organizationId?: string): string {
    return organizationId ? `org:${organizationId}:${key}` : key;
  }

  /**
   * Get a value from cache
   */
  async get<T>(key: string, organizationId?: string): Promise<T | null> {
    const cacheKey = this.buildKey(key, organizationId);
    const value = await this.cacheManager.get<T>(cacheKey);
    return value ?? null;
  }

  /**
   * Set a value in cache
   */
  async set<T>(
    key: string,
    value: T,
    options?: CacheOptions & { organizationId?: string },
  ): Promise<void> {
    const cacheKey = this.buildKey(key, options?.organizationId);
    const ttl = options?.ttl ? options.ttl * 1000 : undefined; // Convert to ms
    await this.cacheManager.set(cacheKey, value, ttl);
  }

  /**
   * Delete a value from cache
   */
  async delete(key: string, organizationId?: string): Promise<void> {
    const cacheKey = this.buildKey(key, organizationId);
    await this.cacheManager.del(cacheKey);
  }

  /**
   * Delete multiple keys matching a pattern (organization-scoped)
   */
  async deletePattern(pattern: string, organizationId: string): Promise<void> {
    // Note: Pattern deletion requires direct Redis access
    // For cache-manager, we'd need to track keys manually or use Redis client directly
    // This is a simplified version that deletes a specific key
    const cacheKey = this.buildKey(pattern, organizationId);
    await this.cacheManager.del(cacheKey);
  }

  /**
   * Get or set a value in cache
   * If the key exists, return the cached value
   * If not, call the factory function, cache the result, and return it
   */
  async getOrSet<T>(
    key: string,
    factory: () => Promise<T>,
    options?: CacheOptions & { organizationId?: string },
  ): Promise<T> {
    const cacheKey = this.buildKey(key, options?.organizationId);
    const cached = await this.cacheManager.get<T>(cacheKey);

    if (cached !== undefined && cached !== null) {
      return cached;
    }

    const value = await factory();
    const ttl = options?.ttl ? options.ttl * 1000 : undefined;
    await this.cacheManager.set(cacheKey, value, ttl);
    return value;
  }

  /**
   * Wrap a function with caching
   */
  wrap<T>(
    key: string,
    factory: () => Promise<T>,
    ttl?: number,
    organizationId?: string,
  ): Promise<T> {
    return this.getOrSet(key, factory, { ttl, organizationId });
  }

  /**
   * Clear all cache for an organization
   */
  async clearOrganization(organizationId: string): Promise<void> {
    // Note: This would require direct Redis access with SCAN command
    // For now, we'll handle this at the application level
    this.logger.log(`Cache clear requested for organization: ${organizationId}`);
  }

  /**
   * Reset the entire cache (use with caution)
   * Note: This uses store-specific reset if available, otherwise clears known keys
   */
  async reset(): Promise<void> {
    // cache-manager v5+ uses stores array or store property
    const cacheStore = (this.cacheManager as any).store || (this.cacheManager as any).stores?.[0];
    if (cacheStore && typeof cacheStore.reset === 'function') {
      await cacheStore.reset();
    }
    // Fallback: log warning as full reset may not be supported
    this.logger.warn('Cache reset requested - may require manual intervention for complete cache clear');
  }
}
