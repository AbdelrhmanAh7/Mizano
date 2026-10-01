import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { lastValueFrom, of } from 'rxjs';
import { CacheService } from '../../cache/cache.service';
import { LEDGER_CACHE_PATTERNS, InvalidatesLedger } from '../decorators/invalidate-cache.decorator';
import { CacheInvalidationInterceptor } from './cache-invalidation.interceptor';

describe('CacheInvalidationInterceptor', () => {
  const ctx = {
    getHandler: () => handler,
    switchToHttp: () => ({
      getRequest: () => ({ user: { organizationId: 'org-1' }, method: 'POST', path: '/x' }),
    }),
  } as unknown as ExecutionContext;
  class Ctl {
    @InvalidatesLedger('bills:*')
    approve(): void {}
  }
  const handler = Ctl.prototype.approve;

  it('invalidates module + ledger caches before releasing the response', async () => {
    const order: string[] = [];
    const cache = {
      deletePattern: jest.fn(async (p: string) => {
        order.push(`delete ${p}`);
        return 1;
      }),
    } as unknown as CacheService;
    const interceptor = new CacheInvalidationInterceptor(
      cache,
      new Reflector(),
      new EventEmitter2(),
    );

    const result = await lastValueFrom(interceptor.intercept(ctx, { handle: () => of('body') }));
    order.push('response');

    expect(result).toBe('body');
    expect(order.at(-1)).toBe('response');
    expect((cache.deletePattern as jest.Mock).mock.calls.map((c) => c[0]).sort()).toEqual(
      ['bills:*', ...LEDGER_CACHE_PATTERNS].sort(),
    );
  });

  it('never fails the request when invalidation throws', async () => {
    const cache = {
      deletePattern: jest.fn().mockRejectedValue(new Error('redis down')),
    } as unknown as CacheService;
    const interceptor = new CacheInvalidationInterceptor(
      cache,
      new Reflector(),
      new EventEmitter2(),
    );
    await expect(
      lastValueFrom(interceptor.intercept(ctx, { handle: () => of('ok') })),
    ).resolves.toBe('ok');
  });
});
