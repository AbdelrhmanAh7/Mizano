import { createHash } from 'crypto';

/** Failed sign-ins allowed per account in one window before sign-in is refused for the rest of it. */
export const LOGIN_FAILURE_LIMIT = 10;
export const LOGIN_FAILURE_WINDOW_MS = 15 * 60_000;
const MAX_TRACKED = 10_000;

/**
 * Failed sign-ins per account (one API process; in memory). The per-address limit depends on the
 * forwarded address, which a caller reaching the web server directly could forge; this one keys on
 * the account itself, so password guessing stays capped whatever address is claimed (#639).
 * Emails are kept only as hashes.
 */
export class LoginFailures {
  private readonly entries = new Map<string, { count: number; resetAt: number }>();

  constructor(private readonly now: () => number = Date.now) {}

  private key(email: string): string {
    return createHash('sha256').update(email.trim().toLowerCase()).digest('hex');
  }

  /** True when this account used up its failed attempts for the current window. */
  isBlocked(email: string): boolean {
    const entry = this.entries.get(this.key(email));
    if (!entry) return false;
    if (entry.resetAt <= this.now()) {
      this.entries.delete(this.key(email));
      return false;
    }
    return entry.count >= LOGIN_FAILURE_LIMIT;
  }

  recordFailure(email: string): void {
    const key = this.key(email);
    const now = this.now();
    const entry = this.entries.get(key);
    if (entry && entry.resetAt > now) {
      entry.count++;
      return;
    }
    if (this.entries.size >= MAX_TRACKED) this.prune(now);
    this.entries.set(key, { count: 1, resetAt: now + LOGIN_FAILURE_WINDOW_MS });
  }

  clear(email: string): void {
    this.entries.delete(this.key(email));
  }

  /** Drops expired windows; if all are live, the oldest ones (insertion order) make room. */
  private prune(now: number): void {
    for (const [key, entry] of this.entries) if (entry.resetAt <= now) this.entries.delete(key);
    for (const key of this.entries.keys()) {
      if (this.entries.size < MAX_TRACKED) break;
      this.entries.delete(key);
    }
  }
}
