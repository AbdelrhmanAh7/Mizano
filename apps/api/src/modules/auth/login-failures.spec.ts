import { LOGIN_FAILURE_LIMIT, LOGIN_FAILURE_WINDOW_MS, LoginFailures } from './login-failures';

describe('LoginFailures (per-account cap on password guessing, #639)', () => {
  let now = 0;
  const failures = (max?: number): LoginFailures => new LoginFailures(() => now, max);
  beforeEach(() => {
    now = 1_000_000;
  });

  it('allows the limit of attempts per account, whatever address they claim, then refuses', () => {
    const f = failures();
    for (let i = 0; i < LOGIN_FAILURE_LIMIT; i++)
      expect(f.tryAttempt('Owner@Nile.test')).toBe(true);
    expect(f.tryAttempt(' owner@nile.test ')).toBe(false);
    expect(f.tryAttempt('other@nile.test')).toBe(true);
  });

  it('opens again when the window ends, and a successful sign-in resets the count', () => {
    const f = failures();
    for (let i = 0; i < LOGIN_FAILURE_LIMIT; i++) f.tryAttempt('a@b.test');
    now += LOGIN_FAILURE_WINDOW_MS;
    expect(f.tryAttempt('a@b.test')).toBe(true);
    for (let i = 0; i < LOGIN_FAILURE_LIMIT - 2; i++) f.tryAttempt('a@b.test');
    f.succeeded('a@b.test');
    for (let i = 0; i < LOGIN_FAILURE_LIMIT; i++) expect(f.tryAttempt('a@b.test')).toBe(true);
  });

  it('flooding other emails never lifts a live lockout', () => {
    const f = failures(5);
    for (let i = 0; i < LOGIN_FAILURE_LIMIT; i++) f.tryAttempt('target@nile.test');
    for (let i = 0; i < 50; i++) f.tryAttempt(`flood${i}@x.test`);
    expect(f.tryAttempt('target@nile.test')).toBe(false);
  });

  it('when every tracked account is locked, a new account is not tracked but not refused', () => {
    const f = failures(2);
    for (const e of ['a@x.test', 'b@x.test'])
      for (let i = 0; i < LOGIN_FAILURE_LIMIT; i++) f.tryAttempt(e);
    expect(f.tryAttempt('new@x.test')).toBe(true);
    expect(f.tryAttempt('a@x.test')).toBe(false);
    expect(f.tryAttempt('b@x.test')).toBe(false);
  });
});
