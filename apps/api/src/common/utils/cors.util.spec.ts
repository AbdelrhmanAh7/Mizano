import { isAllowedCorsOrigin } from './cors.util';

describe('isAllowedCorsOrigin', () => {
  it('allows requests with no origin (e.g. server-to-server, curl, same-origin)', () => {
    expect(isAllowedCorsOrigin(undefined, ['http://localhost:5001'], true)).toBe(true);
    expect(isAllowedCorsOrigin('', ['http://localhost:5001'], false)).toBe(true);
  });

  it('allows configured origin in production', () => {
    const origins = ['https://mizano.app', 'https://admin.mizano.app'];
    expect(isAllowedCorsOrigin('https://mizano.app', origins, true)).toBe(true);
    expect(isAllowedCorsOrigin('https://admin.mizano.app', origins, true)).toBe(true);
    expect(isAllowedCorsOrigin('https://evil.com', origins, true)).toBe(false);
  });

  it('allows wildcard origin when explicitly set', () => {
    expect(isAllowedCorsOrigin('https://any.com', ['*'], true)).toBe(true);
  });

  it('rejects unlisted localhost in production', () => {
    expect(isAllowedCorsOrigin('http://localhost:3000', ['https://mizano.app'], true)).toBe(false);
    expect(isAllowedCorsOrigin('http://127.0.0.1:4316', ['https://mizano.app'], true)).toBe(false);
  });

  it('allows localhost and 127.0.0.1 on any port in development and test environments', () => {
    expect(isAllowedCorsOrigin('http://localhost:3000', ['http://localhost:5001'], false)).toBe(
      true,
    );
    expect(isAllowedCorsOrigin('http://localhost:4316', ['http://localhost:5001'], false)).toBe(
      true,
    );
    expect(isAllowedCorsOrigin('http://127.0.0.1:4312', ['http://localhost:5001'], false)).toBe(
      true,
    );
    expect(isAllowedCorsOrigin('http://127.0.0.1:4316', ['http://localhost:5001'], false)).toBe(
      true,
    );
    expect(isAllowedCorsOrigin('http://localhost', ['http://localhost:5001'], false)).toBe(true);
    expect(isAllowedCorsOrigin('http://127.0.0.1', ['http://localhost:5001'], false)).toBe(true);
  });

  it('rejects external origins in development if not listed in allowedOrigins', () => {
    expect(isAllowedCorsOrigin('https://evil.com', ['http://localhost:5001'], false)).toBe(false);
    expect(isAllowedCorsOrigin('http://otherhost:3000', ['http://localhost:5001'], false)).toBe(
      false,
    );
  });
});
