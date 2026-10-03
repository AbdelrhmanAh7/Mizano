import { ConfigService } from '@nestjs/config';
import { Cache } from 'cache-manager';
import { CacheService } from './cache.service';

const redis = {
  connect: jest.fn(),
  disconnect: jest.fn(),
  on: jest.fn(),
  status: 'ready',
};
const constructRedis = jest.fn();
jest.mock('ioredis', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation((...args: unknown[]): unknown => constructRedis(...args)),
}));

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

describe('CacheService Redis lifecycle', () => {
  beforeEach(() => {
    redis.connect.mockReset().mockResolvedValue(undefined);
    redis.disconnect.mockReset();
    redis.on.mockReset();
    constructRedis.mockReset().mockReturnValue(redis);
  });

  it('disconnects the direct connection on shutdown exactly once', async () => {
    const service = new CacheService(memoryCache(), {
      get: () => 'redis://127.0.0.1:6380',
    } as unknown as ConfigService);
    await service.onModuleInit();
    expect(service.isRedisAvailable).toBe(true);
    expect(redis.on).toHaveBeenCalledWith('error', expect.any(Function));
    service.onModuleDestroy();
    service.onModuleDestroy();
    expect(service.isRedisAvailable).toBe(false);
    expect(redis.disconnect).toHaveBeenCalledTimes(1);
  });

  it('disconnects a client whose startup connection failed', async () => {
    redis.connect.mockRejectedValue(new Error('synthetic connection failure'));
    const service = new CacheService(memoryCache(), {
      get: () => 'redis://127.0.0.1:6380',
    } as unknown as ConfigService);
    await service.onModuleInit();
    expect(service.isRedisAvailable).toBe(false);
    expect(redis.disconnect).toHaveBeenCalledTimes(1);
    service.onModuleDestroy();
    expect(redis.disconnect).toHaveBeenCalledTimes(1);
  });

  it('starts and stops without a Redis configuration', async () => {
    const service = new CacheService(memoryCache(), {
      get: () => undefined,
    } as unknown as ConfigService);
    await service.onModuleInit();
    service.onModuleDestroy();
    expect(constructRedis).not.toHaveBeenCalled();
    expect(service.isRedisAvailable).toBe(false);
  });
});
