/**
 * A simple bounded Map cache with TTL and max size eviction.
 * Entries are evicted LRU-style when max size is exceeded,
 * and expired entries are lazily cleaned up on access.
 */
export class BoundedCache<T> {
  private cache = new Map<string, { value: T; accessedAt: number; createdAt: number }>();

  constructor(
    private readonly maxSize: number = 50,
    private readonly ttlMs: number = 60 * 60 * 1000, // 1 hour default
  ) {}

  get(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;

    // Check TTL
    if (Date.now() - entry.createdAt > this.ttlMs) {
      this.cache.delete(key);
      return undefined;
    }

    // Update access time for LRU
    entry.accessedAt = Date.now();
    return entry.value;
  }

  set(key: string, value: T): void {
    // Evict if at capacity
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      this.evictOldest();
    }

    this.cache.set(key, {
      value,
      accessedAt: Date.now(),
      createdAt: Date.now(),
    });
  }

  has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }

  forEach(callback: (value: T, key: string) => void): void {
    for (const [key, entry] of this.cache) {
      if (Date.now() - entry.createdAt <= this.ttlMs) {
        callback(entry.value, key);
      }
    }
  }

  private evictOldest(): void {
    let oldestKey: string | null = null;
    let oldestAccess = Infinity;

    for (const [key, entry] of this.cache) {
      // Also remove expired entries
      if (Date.now() - entry.createdAt > this.ttlMs) {
        this.cache.delete(key);
        continue;
      }
      if (entry.accessedAt < oldestAccess) {
        oldestAccess = entry.accessedAt;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
    }
  }
}
