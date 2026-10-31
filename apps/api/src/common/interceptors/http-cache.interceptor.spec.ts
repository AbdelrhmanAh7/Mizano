import { CallHandler, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { lastValueFrom, of } from 'rxjs';
import { CACHE_PROFILES, HttpCacheInterceptor } from './http-cache.interceptor';
import { HttpCacheProfile } from '../decorators/http-cache.decorator';

/**
 * Manual QA: a role created in Settings → Team did not appear in the role list or the member
 * dialog, because GET /roles was sent as `public, max-age=3600` and the browser answered the
 * refetch from its cache. Responses must be private and revalidated (ETag → 304).
 */
describe('HttpCacheInterceptor', () => {
  const run = async (profile: HttpCacheProfile, method = 'GET') => {
    const headers: Record<string, string> = {};
    const reflector = { get: () => profile } as unknown as Reflector;
    const context = {
      getHandler: () => undefined,
      switchToHttp: () => ({
        getRequest: () => ({ method }),
        getResponse: () => ({ setHeader: (k: string, v: string) => (headers[k] = v) }),
      }),
    } as unknown as ExecutionContext;
    const next: CallHandler = { handle: () => of({ data: [] }) };
    await lastValueFrom(new HttpCacheInterceptor(reflector).intercept(context, next));
    return headers;
  };

  it.each(['static', 'short', 'realtime'] as const)(
    'never lets a shared cache or a stale browser copy serve %s tenant data',
    async (profile) => {
      const headers = await run(profile);
      expect(headers['Cache-Control']).toMatch(/^private, no-cache/);
      expect(headers['Cache-Control']).not.toMatch(/public|max-age=[1-9]/);
      expect(headers.Vary).toBe('Authorization');
    },
  );

  it('leaves writes alone', async () => {
    expect(await run('static', 'POST')).toEqual({});
  });

  it('keeps no-store for real-time data', () => {
    expect(CACHE_PROFILES.realtime).toBe('private, no-cache, no-store');
  });
});
