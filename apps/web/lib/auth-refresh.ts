import { createHash } from 'crypto';

/**
 * Per-session access-token refresh coordination.
 *
 * NextAuth callbacks run server-side, so any module-level state is shared by
 * every user served by this Node process. All single-flight and cooldown state
 * is therefore keyed by a hash of the session's own refresh token: concurrent
 * refreshes for the same session share one network call, while different
 * sessions never see each other's results or failures.
 *
 * A successful result is also kept briefly for the refresh token it replaced: requests that
 * left the browser before the new cookie arrived still carry the old token, and the API refuses
 * a rotated-out token, so they reuse the result instead of failing (and signing the person out).
 *
 * The raw refresh token is never used as a map key and never logged.
 */

export interface RefreshedTokens {
  accessToken: string;
  refreshToken: string;
}

/** Performs the network refresh. Resolves null on failure (must not throw secrets). */
export type RefreshTokensFn = (refreshToken: string) => Promise<RefreshedTokens | null>;

export interface TokenRefresherOptions {
  refresh: RefreshTokensFn;
  /** Cooldown after a failed refresh for the same session (default 30s). */
  cooldownMs?: number;
  /** Upper bound on tracked cooldown and recent-result entries (default 10_000). */
  maxCooldownEntries?: number;
  /**
   * How long a successful result answers later calls with the replaced token (default 25s,
   * inside the API's 30s grace for a rotated-out token).
   */
  reuseMs?: number;
  now?: () => number;
}

export interface TokenRefresher {
  /**
   * Refresh tokens for the session owning `refreshToken`.
   * Resolves null if the refresh failed or the session is cooling down.
   */
  refresh(refreshToken: string | undefined | null): Promise<RefreshedTokens | null>;
  /** Drop all state for the session owning `refreshToken` (call on logout). */
  forget(refreshToken: string | undefined | null): void;
  /** Number of in-flight refreshes, cooldowns and kept results (for tests/diagnostics). */
  size(): { inFlight: number; cooldowns: number; recent: number };
  /** Clear all state. */
  reset(): void;
}

export function sessionRefreshKey(refreshToken: string): string {
  return createHash('sha256').update(refreshToken).digest('hex');
}

export function createTokenRefresher(options: TokenRefresherOptions): TokenRefresher {
  const cooldownMs = options.cooldownMs ?? 30_000;
  const maxCooldownEntries = options.maxCooldownEntries ?? 10_000;
  const reuseMs = options.reuseMs ?? 25_000;
  const now = options.now ?? Date.now;

  const inFlight = new Map<string, Promise<RefreshedTokens | null>>();
  // Map preserves insertion order, so the first entry is always the oldest.
  const cooldownUntil = new Map<string, number>();
  const recent = new Map<string, { tokens: RefreshedTokens; until: number }>();

  function pruneCooldowns(currentTime: number): void {
    const expired: string[] = [];
    cooldownUntil.forEach((until, key) => {
      if (until <= currentTime) {
        expired.push(key);
      }
    });
    expired.forEach((key) => cooldownUntil.delete(key));
    while (cooldownUntil.size > maxCooldownEntries) {
      const oldest = cooldownUntil.keys().next().value;
      if (oldest === undefined) break;
      cooldownUntil.delete(oldest);
    }
  }

  function remember(key: string, tokens: RefreshedTokens): void {
    const currentTime = now();
    recent.delete(key);
    recent.set(key, { tokens, until: currentTime + reuseMs });
    const expired: string[] = [];
    recent.forEach((entry, entryKey) => {
      if (entry.until <= currentTime) expired.push(entryKey);
    });
    expired.forEach((entryKey) => recent.delete(entryKey));
    while (recent.size > maxCooldownEntries) {
      const oldest = recent.keys().next().value;
      if (oldest === undefined) break;
      recent.delete(oldest);
    }
  }

  function setCooldown(key: string): void {
    const currentTime = now();
    cooldownUntil.delete(key);
    cooldownUntil.set(key, currentTime + cooldownMs);
    pruneCooldowns(currentTime);
  }

  async function run(key: string, refreshToken: string): Promise<RefreshedTokens | null> {
    try {
      const result = await options.refresh(refreshToken);
      if (!result || !result.accessToken || !result.refreshToken) {
        setCooldown(key);
        return null;
      }
      cooldownUntil.delete(key);
      const tokens = { accessToken: result.accessToken, refreshToken: result.refreshToken };
      remember(key, tokens);
      return tokens;
    } catch {
      setCooldown(key);
      return null;
    }
  }

  return {
    refresh(refreshToken) {
      if (!refreshToken) {
        return Promise.resolve(null);
      }
      const key = sessionRefreshKey(refreshToken);

      const kept = recent.get(key);
      if (kept) {
        if (now() < kept.until) {
          return Promise.resolve({ ...kept.tokens });
        }
        recent.delete(key);
      }

      const until = cooldownUntil.get(key);
      if (until !== undefined) {
        if (now() < until) {
          return Promise.resolve(null);
        }
        cooldownUntil.delete(key);
      }

      const existing = inFlight.get(key);
      if (existing) {
        return existing;
      }

      // Cleanup runs asynchronously, so it always happens after the set below,
      // even if the refresh function fails synchronously.
      const promise: Promise<RefreshedTokens | null> = run(key, refreshToken).finally(() => {
        if (inFlight.get(key) === promise) {
          inFlight.delete(key);
        }
      });
      inFlight.set(key, promise);
      return promise;
    },
    forget(refreshToken) {
      if (!refreshToken) return;
      const key = sessionRefreshKey(refreshToken);
      inFlight.delete(key);
      cooldownUntil.delete(key);
      recent.delete(key);
    },
    size() {
      return { inFlight: inFlight.size, cooldowns: cooldownUntil.size, recent: recent.size };
    },
    reset() {
      inFlight.clear();
      cooldownUntil.clear();
      recent.clear();
    },
  };
}
