import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';
import { CacheService } from '../../cache/cache.service';
import { CACHE_RESPONSE_KEY } from '../decorators/cache-response.decorator';
import { CACHE_TTL_KEY } from '../decorators/cache-ttl.decorator';
import { describeError } from '../utils/redact';

const DEFAULT_TTL_SECONDS = 300; // 5 minutes

/**
 * Intercepts GET requests decorated with @CacheResponse() and:
 *  1. Checks the cache first — returns cached value on hit.
 *  2. On miss, executes the handler, caches the result, and returns it.
 *
 * Cache keys are built as: org:{organizationId}:{prefix}:{queryHash}
 */
@Injectable()
export class CacheResponseInterceptor implements NestInterceptor {
  private readonly logger = new Logger(CacheResponseInterceptor.name);

  constructor(
    private readonly cacheService: CacheService,
    private readonly reflector: Reflector,
  ) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const prefix = this.reflector.get<string | undefined>(CACHE_RESPONSE_KEY, context.getHandler());

    // No @CacheResponse decoration → pass through
    if (!prefix) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest();

    // Only cache GET requests
    if (request.method !== 'GET') {
      return next.handle();
    }

    const organizationId: string | undefined = request.user?.organizationId;
    if (!organizationId) {
      return next.handle();
    }

    const queryHash = this.hashQuery(request.query, request.params);
    const cacheKey = `${prefix}:${queryHash}`;

    // 1. Check cache
    try {
      const cached = await this.cacheService.get<unknown>(cacheKey, organizationId);
      if (cached !== null) {
        this.logger.debug(`Cache HIT: ${cacheKey}`);
        return of(cached);
      }
    } catch (error) {
      this.logger.warn(
        `Cache read error for ${cacheKey}: ${describeError(error, { includeMessage: false })}`,
      );
    }

    // 2. Execute handler + cache result
    const ttl =
      this.reflector.get<number | undefined>(CACHE_TTL_KEY, context.getHandler()) ??
      DEFAULT_TTL_SECONDS;

    return next.handle().pipe(
      tap((response) => {
        void (async () => {
          try {
            await this.cacheService.set(cacheKey, response, {
              ttl,
              organizationId,
            });
            this.logger.debug(`Cache SET: ${cacheKey} (TTL ${ttl}s)`);
          } catch (error) {
            this.logger.warn(
              `Cache write error for ${cacheKey}: ${describeError(error, { includeMessage: false })}`,
            );
          }
        })();
      }),
    );
  }

  /**
   * Deterministic hash of query params + route params for cache key uniqueness.
   * Sorts keys for consistency regardless of parameter order.
   */
  private hashQuery(
    query: Record<string, string> | undefined,
    params: Record<string, string> | undefined,
  ): string {
    const combined: Record<string, string> = {
      ...(params || {}),
      ...(query || {}),
    };

    const keys = Object.keys(combined).sort();
    if (keys.length === 0) return '_default';

    const parts = keys.map((k) => `${k}=${combined[k] ?? ''}`);
    return this.simpleHash(parts.join('&'));
  }

  /**
   * Fast non-crypto hash for cache key suffix.
   * DJB2 algorithm — deterministic & collision-resistant for short strings.
   */
  private simpleHash(str: string): string {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
      hash = (hash * 33) ^ str.charCodeAt(i);
    }
    return (hash >>> 0).toString(36);
  }
}
