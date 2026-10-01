/**
 * Idempotency keys for non-repeatable actions (e.g. running a recurring journal by hand). One
 * key is created per user action and reused for every retry of it, so the server can recognise
 * a retried request and return the original result instead of posting twice. The key is
 * released only after the action succeeded.
 */
const pending = new Map<string, string>();

function randomKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback for non-secure contexts: RFC 4122 version 4 shape.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16);
    return (c === 'x' ? r : (r % 4) + 8).toString(16);
  });
}

/** The key of the action identified by `scope` (created on first use, reused on retry). */
export function idempotencyKeyFor(scope: string): string {
  const existing = pending.get(scope);
  if (existing) return existing;
  const key = randomKey();
  pending.set(scope, key);
  return key;
}

/** Releases the key after the action succeeded, so the next action gets a fresh one. */
export function releaseIdempotencyKey(scope: string): void {
  pending.delete(scope);
}
