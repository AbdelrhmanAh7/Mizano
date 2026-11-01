import { authRateLimitPerMinute } from './auth.controller';

describe('authRateLimitPerMinute (TestSprite theme 1)', () => {
  it('is 5 sign-ins per client address per minute unless configured', () => {
    expect(authRateLimitPerMinute(undefined)).toBe(5);
    expect(authRateLimitPerMinute('')).toBe(5);
  });

  it('takes a whole number from 1 to 1000 for a test copy', () => {
    expect(authRateLimitPerMinute('60')).toBe(60);
    expect(authRateLimitPerMinute('1000')).toBe(1000);
  });

  it('ignores anything else, keeping the safe default', () => {
    for (const raw of ['0', '-3', '2.5', '1001', 'lots', 'Infinity']) {
      expect(authRateLimitPerMinute(raw)).toBe(5);
    }
  });
});
