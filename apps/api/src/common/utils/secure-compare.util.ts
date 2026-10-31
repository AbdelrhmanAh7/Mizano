import { createHash, timingSafeEqual } from 'crypto';

/**
 * Constant-time comparison of two secrets.
 *
 * Both values are hashed first so the buffers handed to `timingSafeEqual` always
 * have equal length: this avoids the thrown error on length mismatch and does not
 * leak the expected secret's length through timing. Non-string input never matches.
 */
export function timingSafeStringEqual(provided: unknown, expected: unknown): boolean {
  if (typeof provided !== 'string' || typeof expected !== 'string') return false;
  const providedDigest = createHash('sha256').update(provided, 'utf8').digest();
  const expectedDigest = createHash('sha256').update(expected, 'utf8').digest();
  return timingSafeEqual(providedDigest, expectedDigest);
}
