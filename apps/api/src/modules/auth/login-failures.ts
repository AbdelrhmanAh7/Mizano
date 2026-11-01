import { createHash } from 'crypto';

/** Sign-in attempts allowed per account in one window unless one succeeds (which resets it). */
export const LOGIN_FAILURE_LIMIT = 10;
export const LOGIN_FAILURE_WINDOW_MS = 15 * 60_000;
const MAX_TRACKED = 20_000;

/**
 * Sign-in attempts per account and client address (one API process; in memory), on top of the
 * per-address rate limit: at most LOGIN_FAILURE_LIMIT guesses at one account from one address per
 * window. Keyed with the address so guesses from elsewhere never lock the real owner out (#639). The
 * address is the one the rate limit uses: from the internet it is what Cloudflare appended and
 * cannot be forged; only something already inside the server's private network could claim
 * another. Emails and addresses are kept only as hashes.
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

  private key(email: string, address: string): string {
    return createHash('sha256').update(`${email.trim().toLowerCase()}\n${address}`).digest('hex');
  }

  /** Reserves one attempt for this account; false when its attempts for the window are used up. */
  tryAttempt(email: string, address: string): boolean {
    const key = this.key(email, address);
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
  succeeded(email: string, address: string): void {
    this.entries.delete(this.key(email, address));
  }

  /**
   * Frees room by dropping expired windows only. A live count is never dropped, so flooding other
   * pairs cannot reset one that is already counting. If the tracker is still full, a new pair is
   * let through untracked: it is still held to the per-address rate limit, and refusing it instead
   * would let anyone with enough addresses lock every other person out.
   */
  private makeRoom(now: number): boolean {
    for (const [key, entry] of this.entries) if (entry.resetAt <= now) this.entries.delete(key);
    return this.entries.size < this.maxTracked;
  }
}
