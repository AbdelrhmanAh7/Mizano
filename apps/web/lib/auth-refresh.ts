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
  /** Upper bound on tracked cooldown entries (default 10_000). */
  maxCooldownEntries?: number;
  now?: () => number;
}

export interface TokenRefresher {
  /**
   * Refresh tokens for the session owning `refreshToken`.
   * Resolves null if the refresh failed or the session is cooling down.
   */
  refresh(refreshToken: string | undefined | null): Promise<RefreshedTokens | null>;
  /** Number of in-flight refreshes and cooldown entries (for tests/diagnostics). */
  size(): { inFlight: number; cooldowns: number };
  /** Clear all state. */
  reset(): void;
}

export function sessionRefreshKey(refreshToken: string): string {
  return createHash('sha256').update(refreshToken).digest('hex');
}

export function createTokenRefresher(options: TokenRefresherOptions): TokenRefresher {
  const cooldownMs = options.cooldownMs ?? 30_000;
  const maxCooldownEntries = options.maxCooldownEntries ?? 10_000;
  const now = options.now ?? Date.now;

  const inFlight = new Map<string, Promise<RefreshedTokens | null>>();
  // Map preserves insertion order, so the first entry is always the oldest.
  const cooldownUntil = new Map<string, number>();

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
      return { accessToken: result.accessToken, refreshToken: result.refreshToken };
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
    size() {
      return { inFlight: inFlight.size, cooldowns: cooldownUntil.size };
    },
    reset() {
      inFlight.clear();
      cooldownUntil.clear();
    },
  };
}
