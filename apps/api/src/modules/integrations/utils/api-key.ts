import { createHash, randomBytes } from 'crypto';

/**
 * Integration API keys: `mzk_` + 43 base64url characters (256 random bits). Only the SHA-256 is
 * stored. A slow hash is unnecessary for a uniformly random 256-bit secret, and a direct hash
 * lookup avoids comparing candidate keys one by one.
 */
export const API_KEY_PREFIX = 'mzk_';
const DISPLAY_PREFIX_LENGTH = 12;

export function generateApiKey(): { key: string; prefix: string; hash: string } {
  const key = `${API_KEY_PREFIX}${randomBytes(32).toString('base64url')}`;
  return { key, prefix: key.slice(0, DISPLAY_PREFIX_LENGTH), hash: hashApiKey(key) };
}

export function hashApiKey(key: string): string {
  return createHash('sha256').update(key, 'utf8').digest('hex');
}

/** Cheap shape check before touching the database. */
export function looksLikeApiKey(value: string): boolean {
  return /^mzk_[A-Za-z0-9_-]{43}$/.test(value);
}
