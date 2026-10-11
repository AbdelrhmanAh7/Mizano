import { ConfigService } from '@nestjs/config';
import { Cache } from 'cache-manager';
import { CacheService } from './cache.service';

function memoryCache(): Cache & { store: Map<string, unknown> } {
  const store = new Map<string, unknown>();
  return {
    store,
    get: jest.fn(async (k: string) => store.get(k)),
    set: jest.fn(async (k: string, v: unknown) => {
      store.set(k, v);
    }),
    del: jest.fn(async (k: string) => store.delete(k)),
  } as unknown as Cache & { store: Map<string, unknown> };
}

describe('CacheService pattern invalidation (memory store, no Redis)', () => {
  it('deletes keys matching a glob for the organization only', async () => {
    const cache = memoryCache();
    const service = new CacheService(cache, { get: () => undefined } as unknown as ConfigService);

    await service.set('journals:list:abc', [1], { organizationId: 'org-a' });
    await service.set('reports:pnl:x', {}, { organizationId: 'org-a' });
    await service.set('journals:list:abc', [2], { organizationId: 'org-b' });

    const deleted = await service.deletePattern('journals:*', 'org-a');

    expect(deleted).toBe(1);
    expect(cache.store.has('org:org-a:journals:list:abc')).toBe(false);
    expect(cache.store.has('org:org-a:reports:pnl:x')).toBe(true);
    expect(cache.store.has('org:org-b:journals:list:abc')).toBe(true);
  });

  it('treats regex metacharacters in keys literally', async () => {
    const cache = memoryCache();
    const service = new CacheService(cache, { get: () => undefined } as unknown as ConfigService);
    await service.set('a.b:list', 1, { organizationId: 'o' });
    await service.set('aXb:list', 1, { organizationId: 'o' });

    await service.deletePattern('a.b:*', 'o');

    expect(cache.store.has('org:o:a.b:list')).toBe(false);
    expect(cache.store.has('org:o:aXb:list')).toBe(true);
  });

  it('clearOrganization removes every key of that organization', async () => {
    const cache = memoryCache();
    const service = new CacheService(cache, { get: () => undefined } as unknown as ConfigService);
    await service.set('x', 1, { organizationId: 'o' });
    await service.getOrSet('y', async () => 2, { organizationId: 'o' });

    expect(await service.clearOrganization('o')).toBe(2);
    expect(cache.store.size).toBe(0);
  });
});

describe('CacheService.claim (no Redis)', () => {
  function service(): CacheService {
    return new CacheService(memoryCache(), { get: () => undefined } as unknown as ConfigService);
  }

  it('grants a concurrent claim to exactly one caller', async () => {
    const svc = service();

    const results = await Promise.all([svc.claim('k', 30), svc.claim('k', 30), svc.claim('k', 30)]);

    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it('lets the next caller claim after a release', async () => {
    const svc = service();
    await svc.claim('k', 30);
    await svc.releaseClaim('k');

    expect(await svc.claim('k', 30)).toBe(true);
  });

  it('lets the next caller claim once the TTL has passed', async () => {
    const svc = service();
    const now = jest.spyOn(Date, 'now').mockReturnValue(1_000);
    await svc.claim('k', 30);
    now.mockReturnValue(1_000 + 31_000);

    expect(await svc.claim('k', 30)).toBe(true);
    now.mockRestore();
  });
});

describe('CacheService flags and Redis claim failures', () => {
  function service(): CacheService {
    return new CacheService(memoryCache(), { get: () => undefined } as unknown as ConfigService);
  }

  it('sets, reads and clears a durable flag', async () => {
    const svc = service();
    expect(await svc.hasFlag('f')).toBe(false);
    await svc.setFlag('f', 60);
    expect(await svc.hasFlag('f')).toBe(true);
    await svc.clearFlag('f');
    expect(await svc.hasFlag('f')).toBe(false);
  });

  it('keeps the flag in Redis, not cache-manager, when Redis is connected', async () => {
    const svc = service();
    const redis = {
      status: 'ready',
      set: jest.fn().mockResolvedValue('OK'),
      exists: jest.fn().mockResolvedValue(1),
    };
    (svc as unknown as { redisClient: unknown }).redisClient = redis;

    await svc.setFlag('f', 60);

    expect(redis.set).toHaveBeenCalledWith('f', '1', 'EX', 60);
    expect(await svc.hasFlag('f')).toBe(true);
  });

  it('fails the claim closed when Redis errors instead of using a local lock', async () => {
    const svc = service();
    const redis = { status: 'ready', set: jest.fn().mockRejectedValue(new Error('down')) };
    (svc as unknown as { redisClient: unknown }).redisClient = redis;

    expect(await svc.claim('k', 30)).toBe(false);
  });
});
