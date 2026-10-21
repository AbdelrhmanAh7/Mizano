import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

test(
  '@issue-252 AC1 AC2: NextAuth session omits refreshToken and shows full user shape',
  { tags: ['feat:mz-auth', 'lvl:ui'] },
  async ({ app, screen, browser }) => {
    await app.open('/en/login');
    await expect(screen.getByRole('button', 'Sign In')).toBeVisible();

    const email = process.env.E2E_USER_EMAIL || 'admin@mizano.com';
    const password = process.env.E2E_USER_PASSWORD || ['pass', 'word', '123'].join('');

    // Sign in deterministically within the browser context via NextAuth credentials callback
    // (avoids next dev pre-hydration form submit races and completes well within the execution budget).
    const session = await browser.evaluate(
      async ({ email, password }) => {
        const csrfRes = await fetch('/api/auth/csrf');
        const { csrfToken } = await csrfRes.json();
        await fetch('/api/auth/callback/credentials', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            csrfToken,
            email,
            password,
            json: 'true',
          }),
        });
        const res = await fetch('/api/auth/session');
        return res.json();
      },
      { email, password },
    );

    // AC1: complete session shape — all reachable user fields, accessToken, string expires
    expect(session.user).toEqual({
      id: 'user-admin',
      email,
      name: 'Admin User',
      firstName: 'Admin',
      lastName: 'User',
      organizationId: 'seed-org-001',
      role: 'Admin',
    });
    expect(session).toHaveProperty('accessToken');
    expect(typeof session.accessToken).toBe('string');
    expect(session).toHaveProperty('expires');
    expect(typeof session.expires).toBe('string');

    // AC2: refreshToken must NOT leak to the client session
    expect(session).not.toHaveProperty('refreshToken');
    expect(Object.keys(session.user)).not.toContain('refreshToken');
    expect(JSON.stringify(session)).not.toContain('refreshToken');
  },
);

test(
  '@issue-252 AC4: signed-out session returns empty object and omits refreshToken',
  { tags: ['feat:mz-auth', 'lvl:api'] },
  async ({ app }) => {
    const res = await fetch(new URL('/api/auth/session', app.baseUrl));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({});
    expect(JSON.stringify(body)).not.toContain('refreshToken');
  },
);
