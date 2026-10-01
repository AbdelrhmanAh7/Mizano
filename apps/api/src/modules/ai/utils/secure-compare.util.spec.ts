import { timingSafeStringEqual } from './secure-compare.util';

describe('timingSafeStringEqual', () => {
  it('matches equal strings', () => {
    expect(timingSafeStringEqual('s3cret-value', 's3cret-value')).toBe(true);
  });

  it('rejects different strings, including different lengths', () => {
    expect(timingSafeStringEqual('s3cret-value', 's3cret-valuf')).toBe(false);
    expect(timingSafeStringEqual('short', 'a-much-longer-secret')).toBe(false);
    expect(timingSafeStringEqual('', 'secret')).toBe(false);
  });

  it('never matches non-string input, even when both are missing', () => {
    expect(timingSafeStringEqual(undefined, undefined)).toBe(false);
    expect(timingSafeStringEqual(null, 'secret')).toBe(false);
    expect(timingSafeStringEqual(123, '123')).toBe(false);
    expect(timingSafeStringEqual({}, 'secret')).toBe(false);
    expect(timingSafeStringEqual('secret', undefined)).toBe(false);
  });

  it('does not throw on length mismatch (both sides are hashed to equal-length buffers)', () => {
    // crypto.timingSafeEqual throws RangeError for buffers of different length
    expect(() => timingSafeStringEqual('a', 'b'.repeat(500))).not.toThrow();
    expect(timingSafeStringEqual('a', 'b'.repeat(500))).toBe(false);
  });

  it('handles non-ASCII secrets', () => {
    expect(timingSafeStringEqual('سر-عربي', 'سر-عربي')).toBe(true);
    expect(timingSafeStringEqual('سر-عربي', 'سر-عربى')).toBe(false);
  });
});
