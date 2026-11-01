import { LOGIN_FAILURE_LIMIT, LOGIN_FAILURE_WINDOW_MS, LoginFailures } from './login-failures';

const IP = '203.0.113.7';

describe('LoginFailures (per account and address cap on password guessing, #639)', () => {
  let now = 0;
  const failures = (max?: number): LoginFailures => new LoginFailures(() => now, max);
  beforeEach(() => {
    now = 1_000_000;
  });

  it('allows the limit of attempts per account, whatever address they claim, then refuses', () => {
    const f = failures();
    for (let i = 0; i < LOGIN_FAILURE_LIMIT; i++)
      expect(f.tryAttempt('Owner@Nile.test', IP)).toBe(true);
    expect(f.tryAttempt(' owner@nile.test ', IP)).toBe(false);
    expect(f.tryAttempt('other@nile.test', IP)).toBe(true);
  });

  it('guesses from one address never lock the owner out at another', () => {
    const f = failures();
    for (let i = 0; i < LOGIN_FAILURE_LIMIT; i++) f.tryAttempt('owner@nile.test', '198.51.100.9');
    expect(f.tryAttempt('owner@nile.test', '198.51.100.9')).toBe(false);
    expect(f.tryAttempt('owner@nile.test', IP)).toBe(true);
  });

  it('opens again when the window ends, and a successful sign-in resets the count', () => {
    const f = failures();
    for (let i = 0; i < LOGIN_FAILURE_LIMIT; i++) f.tryAttempt('a@b.test', IP);
    now += LOGIN_FAILURE_WINDOW_MS;
    expect(f.tryAttempt('a@b.test', IP)).toBe(true);
    for (let i = 0; i < LOGIN_FAILURE_LIMIT - 2; i++) f.tryAttempt('a@b.test', IP);
    f.succeeded('a@b.test', IP);
    for (let i = 0; i < LOGIN_FAILURE_LIMIT; i++) expect(f.tryAttempt('a@b.test', IP)).toBe(true);
  });

  it('flooding other emails never lifts a live lockout', () => {
    const f = failures(5);
    for (let i = 0; i < LOGIN_FAILURE_LIMIT; i++) f.tryAttempt('target@nile.test', IP);
    for (let i = 0; i < 50; i++) f.tryAttempt(`flood${i}@x.test`, IP);
    expect(f.tryAttempt('target@nile.test', IP)).toBe(false);
  });

  it('interleaving fresh emails with guesses never resets the target count', () => {
    const f = failures(2);
    let allowed = 0;
    for (let i = 0; i < 25; i++) {
      if (f.tryAttempt('target@nile.test', IP)) allowed++;
      f.tryAttempt(`fresh-a-${i}@x.test`, IP);
      f.tryAttempt(`fresh-b-${i}@x.test`, IP);
    }
    expect(allowed).toBe(LOGIN_FAILURE_LIMIT);
  });

  it('when full of live counts a new account is refused, and admitted again once windows expire', () => {
    const f = failures(2);
    f.tryAttempt('a@x.test', IP);
    f.tryAttempt('b@x.test', IP);
    expect(f.tryAttempt('new@x.test', IP)).toBe(false);
    now += LOGIN_FAILURE_WINDOW_MS;
    expect(f.tryAttempt('new@x.test', IP)).toBe(true);
  });
});
