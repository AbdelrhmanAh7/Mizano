import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

function apiBase(baseUrl: string): string {
  return (process.env.E2E_ARMY_API ?? new URL('/api', baseUrl).toString()).replace(/\/+$/, '');
}

test(
  '@issue-252 AC1 AC2: NextAuth session omits refreshToken and shows full user shape',
  { tags: ['feat:mz-auth', 'lvl:ui'] },
  async ({ app, agent, screen }) => {
    // Sign in through the form as the seeded demo admin.
    await app.open('/en/login');
    await agent.act('sign in as {email} with password {pw}', {
      params: { email: 'admin@mizano.com', pw: 'password123' },
    });

    // After sign-in, fetch the NextAuth session endpoint from the browser context
    // (the session cookie is set by NextAuth during sign-in).
    const session = await screen.evaluate(async () => {
      const res = await fetch('/api/auth/session');
      return res.json();
    });

    // AC1: complete session shape — all user fields, accessToken, expires
    expect(session).toHaveProperty('user');
    expect(session.user).toHaveProperty('id');
    expect(session.user).toHaveProperty('email', 'admin@mizano.com');
    expect(session.user).toHaveProperty('firstName');
    expect(session.user).toHaveProperty('lastName');
    expect(session.user).toHaveProperty('organizationId');
    expect(session.user).toHaveProperty('role');
    expect(session).toHaveProperty('accessToken');
    expect(typeof session.accessToken).toBe('string');
    expect(session).toHaveProperty('expires');
    expect(typeof session.expires).toBe('string');

    // AC2: refreshToken must NOT leak to the client session
    expect(session).not.toHaveProperty('refreshToken');
    expect(JSON.stringify(session)).not.toContain('refreshToken');
  },
);
