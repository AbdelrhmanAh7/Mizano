import { LOGIN_FAILURE_LIMIT, LOGIN_FAILURE_WINDOW_MS, LoginFailures } from './login-failures';

describe('LoginFailures (per-account cap on password guessing, #639)', () => {
  let now = 0;
  const failures = (): LoginFailures => new LoginFailures(() => now);
  beforeEach(() => {
    now = 1_000_000;
  });

  it('blocks an account after the limit of failures, whatever address the guesses claim', () => {
    const f = failures();
    for (let i = 0; i < LOGIN_FAILURE_LIMIT - 1; i++) f.recordFailure('Owner@Nile.test');
    expect(f.isBlocked('owner@nile.test')).toBe(false);
    f.recordFailure(' owner@nile.test ');
    expect(f.isBlocked('OWNER@nile.test')).toBe(true);
    expect(f.isBlocked('other@nile.test')).toBe(false);
  });

  it('opens again when the window ends, and a successful sign-in clears the count', () => {
    const f = failures();
    for (let i = 0; i < LOGIN_FAILURE_LIMIT; i++) f.recordFailure('a@b.test');
    now += LOGIN_FAILURE_WINDOW_MS;
    expect(f.isBlocked('a@b.test')).toBe(false);
    for (let i = 0; i < LOGIN_FAILURE_LIMIT - 1; i++) f.recordFailure('a@b.test');
    f.clear('a@b.test');
    f.recordFailure('a@b.test');
    expect(f.isBlocked('a@b.test')).toBe(false);
  });
});
