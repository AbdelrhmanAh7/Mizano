import { createHash, timingSafeEqual } from 'crypto';

/**
 * Refresh and reset tokens are stored as SHA-256 digests. bcrypt is unsuitable here: it only
 * reads the first 72 bytes, and every JWT of one user shares that prefix, so a rotated-out
 * token would still verify.
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Constant-time comparison of two hex digests. */
export function digestsEqual(a: string, b: string | null | undefined): boolean {
  if (!b) return false;
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
