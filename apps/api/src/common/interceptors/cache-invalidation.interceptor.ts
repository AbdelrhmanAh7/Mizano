import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { CacheService } from '../../cache/cache.service';
import { INVALIDATE_CACHE_KEY } from '../decorators/invalidate-cache.decorator';

/**
 * Cache invalidation event payload emitted after successful write operations.
 */
export interface CacheInvalidatedEvent {
  patterns: string[];
  organizationId: string;
  method: string;
  path: string;
}

/**
 * Intercepts write requests (POST/PUT/PATCH/DELETE) decorated with
 * @InvalidateCache() and deletes matching cache patterns after a
 * successful response.
 *
 * Also emits 'cache.invalidated' events via EventEmitter2 for
 * cross-module cache invalidation (e.g., journal entry creation
 * invalidates dashboard cache).
 */
@Injectable()
export class CacheInvalidationInterceptor implements NestInterceptor {
  private readonly logger = new Logger(CacheInvalidationInterceptor.name);

  constructor(
    private readonly cacheService: CacheService,
    private readonly reflector: Reflector,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const patterns = this.reflector.get<string[] | undefined>(
      INVALIDATE_CACHE_KEY,
      context.getHandler(),
    );

    // No @InvalidateCache decoration → pass through
    if (!patterns || patterns.length === 0) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest();
    const organizationId: string | undefined = request.user?.organizationId;

    // No org context → skip invalidation
    if (!organizationId) {
      return next.handle();
    }

    return next.handle().pipe(
      tap(async () => {
        try {
          // Delete all patterns in parallel
          const deletePromises = patterns.map((pattern) =>
            this.cacheService.deletePattern(pattern, organizationId),
          );
          const results = await Promise.all(deletePromises);
          const totalDeleted = results.reduce((sum, n) => sum + n, 0);

          this.logger.debug(
            `Cache invalidated: ${patterns.join(', ')} (${totalDeleted} keys) for org ${organizationId}`,
          );

          // Emit event for cross-module listeners
          const event: CacheInvalidatedEvent = {
            patterns,
            organizationId,
            method: request.method,
            path: request.path,
          };
          this.eventEmitter.emit('cache.invalidated', event);
        } catch (error) {
          // Never fail the request due to cache invalidation errors
          this.logger.warn(`Cache invalidation error: ${error}`);
        }
      }),
    );
  }
}
