import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { HTTP_CACHE_KEY, HttpCacheProfile } from '../decorators/http-cache.decorator';

const CACHE_PROFILES: Record<HttpCacheProfile, string> = {
  static: 'public, max-age=3600, stale-while-revalidate=300',
  short: 'private, max-age=30, stale-while-revalidate=60',
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
        if (profile === 'static') {
          response.setHeader('Vary', 'Authorization');
        }
      }),
    );
  }
}
