const WINDOW_MS = 60_000;

/**
 * Fixed one-minute window per key. In-process state is enough for the single API process on
 * the Pi; a second API replica would need this moved to Redis.
 */
export class KeyRateLimiter {
  private windows = new Map<string, { start: number; count: number }>();

  hit(
    keyId: string,
    limit: number,
    now = Date.now(),
  ): { allowed: boolean; remaining: number; resetMs: number } {
    let w = this.windows.get(keyId);
    if (!w || now - w.start >= WINDOW_MS) {
      w = { start: now, count: 0 };
      this.windows.set(keyId, w);
      if (this.windows.size > 5000) this.evict(now);
    }
    w.count += 1;
    const resetMs = w.start + WINDOW_MS - now;
    return { allowed: w.count <= limit, remaining: Math.max(0, limit - w.count), resetMs };
  }

  private evict(now: number): void {
    for (const [k, v] of this.windows) if (now - v.start >= WINDOW_MS) this.windows.delete(k);
  }
}
