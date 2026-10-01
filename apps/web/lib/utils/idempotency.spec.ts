import { idempotencyKeyFor, releaseIdempotencyKey } from './idempotency';

describe('idempotency keys', () => {
  it('reuses the key for retries of the same action and issues a new one after success', () => {
    const first = idempotencyKeyFor('profile-1');
    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(idempotencyKeyFor('profile-1')).toBe(first);
    expect(idempotencyKeyFor('profile-2')).not.toBe(first);
    releaseIdempotencyKey('profile-1');
    expect(idempotencyKeyFor('profile-1')).not.toBe(first);
  });
});
