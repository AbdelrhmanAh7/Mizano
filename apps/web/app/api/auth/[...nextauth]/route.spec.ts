/**
 * @jest-environment node
 */
import { encode, type JWT } from 'next-auth/jwt';

const SECRET = 'route-spec-secret';
const cookieJar = new Map<string, string>();

// The App Router handler reads the request cookies through next/headers.
jest.mock('next/headers', () => ({
  cookies: async () => ({
    getAll: () => Array.from(cookieJar, ([name, value]) => ({ name, value })),
  }),
  headers: async () => new Headers({ host: 'localhost:5001' }),
}));

describe('GET /api/auth/session (NextAuth route)', () => {
  beforeAll(() => {
    process.env.NEXTAUTH_URL = 'http://localhost:5001';
    process.env.NEXTAUTH_SECRET = SECRET;
  });

  beforeEach(() => cookieJar.clear());

  async function getSession(): Promise<{ status: number; body: string }> {
    const { GET } = await import('./route');
    const req = Object.assign(new Request('http://localhost:5001/api/auth/session'), {
      nextUrl: new URL('http://localhost:5001/api/auth/session'),
    });
    const res = (await GET(req, { params: { nextauth: ['session'] } })) as Response;
    return { status: res.status, body: await res.text() };
  }

  const baseToken: JWT = {
    email: 'admin@mizano.com',
    name: 'Admin User',
    id: 'user-1',
    firstName: 'Admin',
    lastName: 'User',
    organizationId: 'org-1',
    role: 'admin',
    accessToken: 'access-token-1',
    refreshToken: 'secret-refresh-token',
    // Far from expiry, so the jwt callback returns the token without a network refresh.
    accessTokenExpires: Date.now() + 10 * 60 * 1000,
  };

  it('returns the signed-in session with all user fields, accessToken and a string expires', async () => {
    const token: JWT = { ...baseToken };
    cookieJar.set('next-auth.session-token', await encode({ token, secret: SECRET }));

    const { status, body } = await getSession();
    const session = JSON.parse(body) as Record<string, unknown>;

    expect(status).toBe(200);
    // AC1: verify the complete session shape — all reachable user fields,
    // accessToken, and a string expires value.
    expect(session).toHaveProperty('user');
    const user = session.user as Record<string, unknown>;
    expect(user).toHaveProperty('id', 'user-1');
    expect(user).toHaveProperty('email', 'admin@mizano.com');
    expect(user).toHaveProperty('name', 'Admin User');
    expect(user).toHaveProperty('firstName', 'Admin');
    expect(user).toHaveProperty('lastName', 'User');
    expect(user).toHaveProperty('organizationId', 'org-1');
    expect(user).toHaveProperty('role', 'admin');

    expect(session).toHaveProperty('accessToken', 'access-token-1');
    expect(typeof session.accessToken).toBe('string');
    expect(session).toHaveProperty('expires');
    expect(typeof session.expires).toBe('string');

    // Deep equality ensures no missing or unexpected fields exist.
    expect(session).toEqual({
      user: {
        name: 'Admin User',
        email: 'admin@mizano.com',
        id: 'user-1',
        firstName: 'Admin',
        lastName: 'User',
        organizationId: 'org-1',
        role: 'admin',
      },
      accessToken: 'access-token-1',
      expires: expect.any(String),
    });
    // AC2: the refresh token must NOT appear in the client-visible session.
    expect(session).not.toHaveProperty('refreshToken');
    expect(Object.keys(session)).not.toContain('refreshToken');
    expect(user).not.toHaveProperty('refreshToken');
    expect(Object.keys(user)).not.toContain('refreshToken');
    expect(body).not.toContain('refreshToken');
    expect(body).not.toContain('secret-refresh-token');
  });

  it('includes error in the session when token.error is present', async () => {
    const token: JWT = { ...baseToken, error: 'RefreshAccessTokenError' };
    cookieJar.set('next-auth.session-token', await encode({ token, secret: SECRET }));

    const { status, body } = await getSession();
    const session = JSON.parse(body) as Record<string, unknown>;

    expect(status).toBe(200);
    expect(session).toHaveProperty('user');
    const user = session.user as Record<string, unknown>;
    expect(user).toHaveProperty('id', 'user-1');
    expect(user).toHaveProperty('email', 'admin@mizano.com');
    expect(user).toHaveProperty('name', 'Admin User');
    expect(user).toHaveProperty('firstName', 'Admin');
    expect(user).toHaveProperty('lastName', 'User');
    expect(user).toHaveProperty('organizationId', 'org-1');
    expect(user).toHaveProperty('role', 'admin');

    expect(session).toHaveProperty('accessToken', 'access-token-1');
    expect(typeof session.accessToken).toBe('string');
    expect(session).toHaveProperty('expires');
    expect(typeof session.expires).toBe('string');
    expect(session).toHaveProperty('error', 'RefreshAccessTokenError');

    expect(session).toEqual({
      user: {
        name: 'Admin User',
        email: 'admin@mizano.com',
        id: 'user-1',
        firstName: 'Admin',
        lastName: 'User',
        organizationId: 'org-1',
        role: 'admin',
      },
      accessToken: 'access-token-1',
      expires: expect.any(String),
      error: 'RefreshAccessTokenError',
    });
    expect(session).not.toHaveProperty('refreshToken');
    expect(Object.keys(session)).not.toContain('refreshToken');
    expect(user).not.toHaveProperty('refreshToken');
    expect(Object.keys(user)).not.toContain('refreshToken');
    expect(body).not.toContain('refreshToken');
    expect(body).not.toContain('secret-refresh-token');
  });

  it('returns an empty object when signed out', async () => {
    const { status, body } = await getSession();
    expect(status).toBe(200);
    expect(JSON.parse(body)).toEqual({});
    expect(body).not.toContain('refreshToken');
  });
});
