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

  it('returns the signed-in session without the refresh token kept in the JWT cookie', async () => {
    const token: JWT = {
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
    cookieJar.set('next-auth.session-token', await encode({ token, secret: SECRET }));

    const { status, body } = await getSession();
    const session = JSON.parse(body) as Record<string, unknown>;

    expect(status).toBe(200);
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
    expect(Object.keys(session)).not.toContain('refreshToken');
    expect(body).not.toContain('refreshToken');
    expect(body).not.toContain('secret-refresh-token');
  });

  it('returns an empty object when signed out', async () => {
    const { status, body } = await getSession();
    expect(status).toBe(200);
    expect(JSON.parse(body)).toEqual({});
  });
});
