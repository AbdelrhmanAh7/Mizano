import { Injectable, Logger } from '@nestjs/common';
import { CacheService } from '../../../cache/cache.service';
import * as crypto from 'crypto';

/**
 * TTLs for different AI feature types (in seconds).
 */
const AI_CACHE_TTLS: Record<string, number> = {
  'narrative-monthly': 3600, // 1 hour
  'narrative-weekly': 1800, // 30 min
  categorization: 86400, // 24 hours
  sentiment: 86400, // 24 hours
  'cash-flow': 14400, // 4 hours
  'demand-forecast': 14400, // 4 hours
};

/**
 * Thin wrapper around CacheService with AI-specific key conventions and TTLs.
 * Key format: `ai:{feature}:{orgId}:{hash(input)}`
 */
@Injectable()
export class AiCacheService {
  private readonly logger = new Logger(AiCacheService.name);

  constructor(private readonly cacheService: CacheService) {}

  /**
   * Get a cached AI result, or compute and cache it.
   */
  async getOrSet<T>(
    feature: string,
    organizationId: string,
    input: unknown,
    factory: () => Promise<T>,
    ttlOverride?: number,
  ): Promise<T> {
    const key = this.buildKey(feature, input);
    const ttl = ttlOverride ?? AI_CACHE_TTLS[feature] ?? 1800;

    return this.cacheService.getOrSet<T>(key, factory, {
      ttl,
      organizationId,
    });
  }

  /**
   * Get a cached AI result.
   */
  async get<T>(feature: string, organizationId: string, input: unknown): Promise<T | null> {
    const key = this.buildKey(feature, input);
    return this.cacheService.get<T>(key, organizationId);
  }

  /**
   * Explicitly cache an AI result.
   */
  async set<T>(
    feature: string,
    organizationId: string,
    input: unknown,
    value: T,
    ttlOverride?: number,
  ): Promise<void> {
    const key = this.buildKey(feature, input);
    const ttl = ttlOverride ?? AI_CACHE_TTLS[feature] ?? 1800;
    await this.cacheService.set(key, value, { ttl, organizationId });
  }

  /**
   * Invalidate all cached results for a given AI feature + org.
   */
  async invalidateFeature(feature: string, organizationId: string): Promise<number> {
    const pattern = `ai:${feature}:*`;
    const deleted = await this.cacheService.deletePattern(pattern, organizationId);
    if (deleted > 0) {
      this.logger.debug(
        `Invalidated ${deleted} cached keys for ai:${feature} in org ${organizationId}`,
      );
    }
    return deleted;
  }

  /**
   * Invalidate all AI caches for an organization.
   */
  async invalidateAll(organizationId: string): Promise<number> {
    const deleted = await this.cacheService.deletePattern('ai:*', organizationId);
    if (deleted > 0) {
      this.logger.debug(`Invalidated ${deleted} AI cache keys for org ${organizationId}`);
    }
    return deleted;
  }

  private buildKey(feature: string, input: unknown): string {
    const inputHash = crypto
      .createHash('md5')
      .update(JSON.stringify(input))
      .digest('hex')
      .slice(0, 12);
    return `ai:${feature}:${inputHash}`;
  }
}
