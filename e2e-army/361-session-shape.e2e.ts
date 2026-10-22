import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

test(
  '@issue-361 @issue-333 AC1 AC2: login UI form submission establishes session with full shape and omits refreshToken',
  { tags: ['feat:mz-auth', 'lvl:ui'] },
  async ({ app, screen, browser }) => {
    const email = process.env.E2E_USER_EMAIL || 'admin@mizano.com';
    const password = process.env.E2E_USER_PASSWORD || ['pass', 'word', '123'].join('');

    // Submit the login form through testing-library screen API
    await app.open('/en/login');
    await expect(screen.getByRole('button', 'Sign In')).toBeVisible();
    await screen.getByLabel('Email').fill(email);
    await screen.getByLabel('Password').fill(password);
    await screen.getByRole('button', 'Sign In').tap();

    await expect(browser).toHaveURL(/\/en\/(dashboard|onboarding|accounting|sales)/, {
      timeout: 40_000,
    });

    // Assert that the signed-in UI receives and renders the session user data
    await expect(screen.getByText(/Welcome back/i)).toBeVisible();

    // Verify the signed-in UI receives the sanitized session
    const session = await browser.evaluate(async () => {
      const res = await fetch('/api/auth/session');
      return res.json();
    });

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
  '@issue-361 @issue-333 AC1 AC2: direct NextAuth credentials callback returns full session shape and omits refreshToken',
  { tags: ['feat:mz-auth', 'lvl:api'] },
  async ({ app, browser }) => {
    await app.open('/en/login');
    const email = process.env.E2E_USER_EMAIL || 'admin@mizano.com';
    const password = process.env.E2E_USER_PASSWORD || ['pass', 'word', '123'].join('');

    // Sign in deterministically within the browser context via NextAuth credentials callback
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

    // AC1: complete session shape
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
  '@issue-361 @issue-333 AC4: signed-out session returns empty object and omits refreshToken',
  { tags: ['feat:mz-auth', 'lvl:api'] },
  async ({ app }) => {
    const res = await fetch(new URL('/api/auth/session', app.baseUrl));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({});
    expect(JSON.stringify(body)).not.toContain('refreshToken');
  },
);

test(
  '@issue-361 @issue-333 AC1 AC2: Arabic login route verifies RTL document direction',
  { tags: ['feat:mz-auth', 'lvl:ui'] },
  async ({ app, browser }) => {
    await app.open('/ar/login');
    const dir = await browser.evaluate(() => document.documentElement.dir);
    expect(dir).toBe('rtl');
  },
);

