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
