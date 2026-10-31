import { createHash, randomBytes, timingSafeEqual } from 'crypto';

/**
 * Opaque credentials: a short prefix (so a leaked value is recognisable) plus 256 random bits.
 * Only the sha256 is stored; a slow hash adds nothing for a uniformly random 256-bit secret and
 * a direct hash lookup avoids comparing candidates one by one.
 */
export type CredentialKind = 'at' | 'rt' | 'code' | 'req' | 'secret';

export function newCredential(kind: CredentialKind): string {
  return `mzm_${kind}_${randomBytes(32).toString('base64url')}`;
}

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function looksLikeCredential(value: unknown, kind: CredentialKind): value is string {
  return typeof value === 'string' && new RegExp(`^mzm_${kind}_[A-Za-z0-9_-]{43}$`).test(value);
}

export function newClientId(): string {
  return `mzm_client_${randomBytes(16).toString('base64url')}`;
}

/** RFC 7636: verifier is 43–128 characters of [A-Z a-z 0-9 - . _ ~]. */
const VERIFIER_RE = /^[A-Za-z0-9._~-]{43,128}$/;
/** S256 challenge: base64url sha256, 43 characters without padding. */
const CHALLENGE_RE = /^[A-Za-z0-9_-]{43}$/;

export function isValidChallenge(challenge: unknown): challenge is string {
  return typeof challenge === 'string' && CHALLENGE_RE.test(challenge);
}

/** S256 only (OAuth 2.1 forbids `plain` where S256 is possible). Constant-time compare. */
export function pkceMatches(verifier: unknown, challenge: string): boolean {
  if (typeof verifier !== 'string' || !VERIFIER_RE.test(verifier)) return false;
  const computed = Buffer.from(createHash('sha256').update(verifier, 'ascii').digest('base64url'));
  const expected = Buffer.from(challenge);
  return computed.length === expected.length && timingSafeEqual(computed, expected);
}
