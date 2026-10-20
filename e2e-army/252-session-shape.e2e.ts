import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

test(
  '@issue-252 AC1 AC2: NextAuth session omits refreshToken and shows full user shape',
  { tags: ['feat:mz-auth', 'lvl:ui'] },
  async ({ app, screen, browser }) => {
    // Sign in through the form as the seeded demo admin using locators (deterministic, no model latency).
    for (let i = 0; i < 3; i++) {
      await app.open('/en/login');
      await expect(screen.getByRole('button', 'Sign In')).toBeVisible();
      await screen.getByRole('textbox', 'Email').fill('admin@mizano.com');
      await screen.getByRole('textbox', 'Password').fill('password123');
      await screen.getByRole('button', 'Sign In').tap();
      try {
        await expect(browser).toHaveURL(/\/en\/(dashboard|onboarding|accounting|sales)/, {
          timeout: 40_000,
        });
        break;
      } catch (e) {
        if (i === 2) throw e;
      }
    }

    // After sign-in, fetch the NextAuth session endpoint from the browser context
    // (the session cookie is set by NextAuth during sign-in).
    const session = await screen.evaluate(async () => {
      const res = await fetch('/api/auth/session');
      return res.json();
    });

    // AC1: complete session shape — all reachable user fields, accessToken, string expires
    expect(session.user).toEqual({
      id: 'user-admin',
      email: 'admin@mizano.com',
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

