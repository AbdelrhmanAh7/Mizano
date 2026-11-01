import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { HTTP_CACHE_KEY, HttpCacheProfile } from '../decorators/http-cache.decorator';

/**
 * Every profile is private (tenant data behind a bearer token must never sit in a shared cache)
 * and revalidates on each use. A max-age let the browser answer React Query's refetch after a
 * write from its own cache: a new role, account or tax rate stayed invisible for an hour and a
 * new invoice was missing from its list for 30 s. Revalidation stays cheap: Express sends an
 * ETag and unchanged responses come back as 304 without a body.
 */
export const CACHE_PROFILES: Record<HttpCacheProfile, string> = {
  static: 'private, no-cache',
  short: 'private, no-cache',
  realtime: 'private, no-cache, no-store',
};

@Injectable()
export class HttpCacheInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const profile = this.reflector.get<HttpCacheProfile | undefined>(
      HTTP_CACHE_KEY,
      context.getHandler(),
    );

    if (!profile) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest();
    if (request.method !== 'GET') {
      return next.handle();
    }

    const response = context.switchToHttp().getResponse();

    return next.handle().pipe(
      tap(() => {
        response.setHeader('Cache-Control', CACHE_PROFILES[profile]);
        response.setHeader('Vary', 'Authorization, Accept-Language');
      }),
    );
  }
}
