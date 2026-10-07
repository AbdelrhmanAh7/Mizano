import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cache } from 'cache-manager';
import Redis from 'ioredis';

export interface CacheOptions {
  ttl?: number; // Time to live in seconds
  prefix?: string;
}

export interface CacheStats {
  storeType: 'redis' | 'memory';
  connected: boolean;
  keyCount: number;
  memoryUsage: string;
  uptime: number;
  hitRate: number;
}

export interface CacheKeyInfo {
  key: string;
  ttl: number; // remaining TTL in seconds, -1 = no expiry, -2 = key gone
}

export type RedisStatus = 'connected' | 'disconnected' | 'not_configured';

/** Upper bound for one readiness PING so a hung Redis cannot stall the probe. */
const PING_TIMEOUT_MS = 2000;

@Injectable()
export class CacheService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CacheService.name);
  private redisClient: Redis | null = null;
  private hits = 0;
  private misses = 0;
  /**
   * Keys written through this service. The cache-manager store may be in-process memory
   * (cache-manager v7 ignores the legacy redis `store` option), which cannot be scanned, so
   * pattern invalidation matches against the keys we know we wrote.
   */
  private readonly knownKeys = new Set<string>();
  private static readonly MAX_TRACKED_KEYS = 50_000;

  constructor(
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    private configService: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    const redisUrl = this.configService.get<string>('REDIS_URL');
    if (redisUrl) {
      // The client is kept even when the first connect fails: ioredis keeps reconnecting,
      // so a Redis that comes up later (reboot start order) is picked up without a restart.
      this.redisClient = new Redis(redisUrl, {
        maxRetriesPerRequest: 3,
        lazyConnect: true,
      });
      // ioredis prints every connection error unless someone listens; the readiness probe
      // reports the state instead, and the error text could carry the URL.
      this.redisClient.on('error', () => undefined);
      try {
        await this.redisClient.connect();
        this.logger.log('Redis client connected for cache operations');
      } catch {
        this.logger.warn('Failed to connect direct Redis client; pattern operations unavailable');
      }
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.redisClient?.disconnect();
    this.redisClient = null;
  }

  /**
   * Whether we have a direct Redis connection for advanced operations
   */
  get isRedisAvailable(): boolean {
    return this.redisClient !== null && this.redisClient.status === 'ready';
  }

  /**
   * Readiness of the configured Redis, from a real PING on the direct client. The
   * cache-manager store behind CACHE_MANAGER is in-process memory (cache-manager v7
   * ignores the legacy redis `store` option), so a set/get through it never reaches Redis.
   */
  async pingRedis(): Promise<{ status: RedisStatus; latency?: number }> {
    if (!this.configService.get<string>('REDIS_URL')) return { status: 'not_configured' };
    if (!this.redisClient) return { status: 'disconnected' };
    const start = Date.now();
    try {
      const pong = await Promise.race([
        this.redisClient.ping(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('ping timeout')), PING_TIMEOUT_MS).unref(),
        ),
      ]);
      return pong === 'PONG'
        ? { status: 'connected', latency: Date.now() - start }
        : { status: 'disconnected' };
    } catch {
      return { status: 'disconnected' };
    }
  }

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
    if (value !== undefined && value !== null) {
      this.hits++;
    } else {
      this.misses++;
    }
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
    this.track(cacheKey);
  }

  /**
   * Delete a value from cache
   */
  async delete(key: string, organizationId?: string): Promise<void> {
    const cacheKey = this.buildKey(key, organizationId);
    await this.cacheManager.del(cacheKey);
  }

  /**
   * Delete multiple keys matching a glob pattern (organization-scoped).
   * Uses Redis SCAN for non-blocking iteration when Redis is available.
   * Falls back to single key deletion for in-memory cache.
   */
  async deletePattern(pattern: string, organizationId: string): Promise<number> {
    const fullPattern = this.buildKey(pattern, organizationId);
    let deleted = await this.deleteKnownKeys(fullPattern);
    if (this.isRedisAvailable) {
      deleted += await this.scanAndDelete(fullPattern);
    }
    return deleted;
  }

  private track(cacheKey: string): void {
    if (this.knownKeys.size >= CacheService.MAX_TRACKED_KEYS) {
      const oldest = this.knownKeys.values().next().value;
      if (oldest !== undefined) this.knownKeys.delete(oldest);
    }
    this.knownKeys.add(cacheKey);
  }

  /** Deletes tracked keys matching a Redis-style glob (`*` and `?`). */
  private async deleteKnownKeys(globPattern: string): Promise<number> {
    const regex = new RegExp(
      '^' +
        globPattern
          .split('')
          .map((c) => (c === '*' ? '.*' : c === '?' ? '.' : c.replace(/[.+^${}()|[\]\\]/g, '\\$&')))
          .join('') +
        '$',
    );
    const matches = [...this.knownKeys].filter((k) => regex.test(k));
    await Promise.all(matches.map((k) => this.cacheManager.del(k)));
    matches.forEach((k) => this.knownKeys.delete(k));
    return matches.length;
  }

  /**
   * Get or set a value in cache (cache-aside pattern).
   * If the key exists, return the cached value.
   * If not, call the factory function, cache the result, and return it.
   */
  async getOrSet<T>(
    key: string,
    factory: () => Promise<T>,
    options?: CacheOptions & { organizationId?: string },
  ): Promise<T> {
    const cacheKey = this.buildKey(key, options?.organizationId);
    const cached = await this.cacheManager.get<T>(cacheKey);

    if (cached !== undefined && cached !== null) {
      this.hits++;
      return cached;
    }

    this.misses++;
    const value = await factory();
    const ttl = options?.ttl ? options.ttl * 1000 : undefined;
    await this.cacheManager.set(cacheKey, value, ttl);
    this.track(cacheKey);
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
   * Clear all cache for an organization using SCAN + batch DEL.
   * Returns the number of keys deleted.
   */
  async clearOrganization(organizationId: string): Promise<number> {
    const count = await this.deletePattern('*', organizationId);
    this.logger.log(`Cleared ${count} cache keys for organization ${organizationId}`);
    return count;
  }

  /**
   * Reset the entire cache (use with caution)
   */
  async reset(): Promise<void> {
    if (this.isRedisAvailable) {
      await this.redisClient!.flushdb();
      this.logger.log('Redis cache flushed via FLUSHDB');
      return;
    }

    const cacheStore = (this.cacheManager as unknown as Record<string, unknown>).store;
    if (cacheStore && typeof (cacheStore as Record<string, unknown>).reset === 'function') {
      await (cacheStore as { reset: () => Promise<void> }).reset();
    }
    this.logger.warn(
      'Cache reset requested — may require manual intervention for complete cache clear',
    );
  }

  /**
   * Get cache statistics (connection, key count, memory, hit rate)
   */
  async getStats(): Promise<CacheStats> {
    const totalRequests = this.hits + this.misses;
    const hitRate = totalRequests > 0 ? (this.hits / totalRequests) * 100 : 0;

    if (this.isRedisAvailable) {
      try {
        const info = await this.redisClient!.info('memory');
        const serverInfo = await this.redisClient!.info('server');
        const keyCount = await this.redisClient!.dbsize();

        const memoryMatch = info.match(/used_memory_human:(.+)/);
        const uptimeMatch = serverInfo.match(/uptime_in_seconds:(\d+)/);

        return {
          storeType: 'redis',
          connected: true,
          keyCount,
          memoryUsage: memoryMatch ? memoryMatch[1].trim() : 'unknown',
          uptime: uptimeMatch ? parseInt(uptimeMatch[1], 10) : 0,
          hitRate: Math.round(hitRate * 100) / 100,
        };
      } catch {
        return {
          storeType: 'redis',
          connected: false,
          keyCount: 0,
          memoryUsage: '0B',
          uptime: 0,
          hitRate: Math.round(hitRate * 100) / 100,
        };
      }
    }

    return {
      storeType: 'memory',
      connected: true,
      keyCount: 0, // in-memory store doesn't expose key count easily
      memoryUsage: 'N/A',
      uptime: 0,
      hitRate: Math.round(hitRate * 100) / 100,
    };
  }

  /**
   * List cache keys for an organization (paginated via cursor-based SCAN).
   * Returns up to `count` keys.
   */
  async getKeys(
    organizationId: string,
    cursor = '0',
    count = 100,
  ): Promise<{ keys: CacheKeyInfo[]; nextCursor: string }> {
    if (!this.isRedisAvailable) {
      return { keys: [], nextCursor: '0' };
    }

    const pattern = `org:${organizationId}:*`;
    const [nextCursor, rawKeys] = await this.redisClient!.scan(
      cursor,
      'MATCH',
      pattern,
      'COUNT',
      count,
    );

    const keys: CacheKeyInfo[] = [];
    if (rawKeys.length > 0) {
      const pipeline = this.redisClient!.pipeline();
      for (const key of rawKeys) {
        pipeline.ttl(key);
      }
      const ttls = await pipeline.exec();
      for (let i = 0; i < rawKeys.length; i++) {
        keys.push({
          key: rawKeys[i],
          ttl: (ttls?.[i]?.[1] as number) ?? -2,
        });
      }
    }

    return { keys, nextCursor };
  }

  /**
   * Delete a single key by its full key name (admin use)
   */
  async deleteKey(fullKey: string): Promise<void> {
    if (this.isRedisAvailable) {
      await this.redisClient!.del(fullKey);
    } else {
      await this.cacheManager.del(fullKey);
    }
  }

  // ─── Private Helpers ──────────────────────────────────

  /**
   * Non-blocking SCAN + batch DEL for a glob pattern.
   * Returns total number of deleted keys.
   */
  private async scanAndDelete(pattern: string): Promise<number> {
    if (!this.redisClient) return 0;

    let cursor = '0';
    let totalDeleted = 0;

    do {
      const [nextCursor, keys] = await this.redisClient.scan(
        cursor,
        'MATCH',
        pattern,
        'COUNT',
        200,
      );
      cursor = nextCursor;

      if (keys.length > 0) {
        const deleted = await this.redisClient.del(...keys);
        totalDeleted += deleted;
      }
    } while (cursor !== '0');

    return totalDeleted;
  }
}
