import { createHash } from 'crypto';

/** Sign-in attempts allowed per account in one window unless one succeeds (which resets it). */
export const LOGIN_FAILURE_LIMIT = 10;
export const LOGIN_FAILURE_WINDOW_MS = 15 * 60_000;
const MAX_TRACKED = 20_000;

/**
 * Failed sign-ins per account (one API process; in memory). The per-address limit depends on the
 * forwarded address, which a caller reaching the web server directly could forge; this one keys on
 * the account itself, so password guessing stays capped whatever address is claimed (#639).
 * Emails are kept only as hashes.
 *
 * An attempt is reserved synchronously before any password check (Node runs this without
 * interleaving), so concurrent requests cannot all slip past the cap; a success clears it.
 */
export class LoginFailures {
  private readonly entries = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly now: () => number = Date.now,
    private readonly maxTracked = MAX_TRACKED,
  ) {}

  private key(email: string): string {
    return createHash('sha256').update(email.trim().toLowerCase()).digest('hex');
  }

  /** Reserves one attempt for this account; false when its attempts for the window are used up. */
  tryAttempt(email: string): boolean {
    const key = this.key(email);
    const now = this.now();
    const entry = this.entries.get(key);
    if (entry && entry.resetAt > now) {
      if (entry.count >= LOGIN_FAILURE_LIMIT) return false;
      entry.count++;
      return true;
    }
    if (entry) this.entries.delete(key);
    if (this.entries.size >= this.maxTracked && !this.makeRoom(now)) return true; // see makeRoom
    this.entries.set(key, { count: 1, resetAt: now + LOGIN_FAILURE_WINDOW_MS });
    return true;
  }

  /** A successful sign-in: the account's count starts again. */
  succeeded(email: string): void {
    this.entries.delete(this.key(email));
  }

  /**
   * Frees one slot: expired windows first, then the oldest account that is not locked. A locked
   * account is never dropped, so flooding other emails cannot lift a lockout. When every tracked
   * account is locked the new account is simply not tracked (the per-address limit still applies).
   */
  private makeRoom(now: number): boolean {
    for (const [key, entry] of this.entries) if (entry.resetAt <= now) this.entries.delete(key);
    if (this.entries.size < this.maxTracked) return true;
    for (const [key, entry] of this.entries) {
      if (entry.count < LOGIN_FAILURE_LIMIT) {
        this.entries.delete(key);
        return true;
      }
    }
    return false;
  }
}
