/**
 * Mock Redis/cache-manager for unit testing.
 * Uses an in-memory Map to simulate cache operations.
 */

export function createMockCacheManager() {
  const store = new Map<string, { value: unknown; ttl?: number }>();

  return {
    get: jest.fn(async (key: string) => {
      const entry = store.get(key);
      return entry?.value ?? null;
    }),
    set: jest.fn(async (key: string, value: unknown, ttl?: number) => {
      store.set(key, { value, ttl });
    }),
    del: jest.fn(async (key: string) => {
      store.delete(key);
    }),
    reset: jest.fn(async () => {
      store.clear();
    }),
    store,
  };
}
