import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

test(
  '@issue-332 AC1 AC2 AC5 AC7 AC8: NextAuth session endpoint omits refreshToken and dashboard displays privacy status',
  { tags: ['feat:mz-auth'] },
  async ({ app, screen, browser }) => {
    // 1. Unauthenticated requests: returns empty session without refreshToken on both root and localized endpoints
    const anonRes = await fetch(new URL('/api/auth/session', app.baseUrl));
    expect(anonRes.status).toBe(200);
    const anonBody = await anonRes.json();
    expect(anonBody).toEqual({});
    expect(JSON.stringify(anonBody)).not.toContain('refreshToken');

    // Reproduces & verifies fix for: GET /en/api/auth/session returned 404
    const localizedAnonRes = await fetch(new URL('/en/api/auth/session', app.baseUrl));
    expect(localizedAnonRes.status).toBe(200);
    const localizedAnonBody = await localizedAnonRes.json();
    expect(localizedAnonBody).toEqual({});
    expect(JSON.stringify(localizedAnonBody)).not.toContain('refreshToken');

    // 2. Authenticated user: sign in through the UI form
    for (let i = 0; i < 3; i++) {
      await app.open('/en/login');
      await expect(screen.getByRole('button', 'Sign In')).toBeVisible();
      await screen.getByLabel('Email').fill('admin@mizano.com');
      await screen.getByLabel('Password').fill('password123');
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

    // 3. UI Dashboard verification: reproduces & verifies fix for finding accessToken and refreshToken on dashboard
    await app.open('/en/dashboard');
    await expect(screen.getByText('accessToken')).toBeVisible();
    await expect(screen.getByText('refreshToken')).toBeVisible();
    await expect(screen.getByText('refreshToken: omitted')).toBeVisible();

    // 4. Localized and root session endpoint verification with cookies
    const cookies = await browser.cookies();
    const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join('; ');

    const sessionRes = await fetch(new URL('/api/auth/session', app.baseUrl), {
      headers: { cookie: cookieHeader },
    });
    expect(sessionRes.status).toBe(200);
    const text = await sessionRes.text();
    expect(text).not.toContain('refreshToken');

    const localizedSessionRes = await fetch(new URL('/en/api/auth/session', app.baseUrl), {
      headers: { cookie: cookieHeader },
    });
    expect(localizedSessionRes.status).toBe(200);
    const localizedText = await localizedSessionRes.text();
    expect(localizedText).not.toContain('refreshToken');

    const session = JSON.parse(text) as {
      user?: { email?: string; id?: string };
      accessToken?: string;
      refreshToken?: string;
    };
    expect(session.user?.email).toBe('admin@mizano.com');
    expect(session.accessToken).toBeDefined();
    expect(session.refreshToken).toBeUndefined();
    expect(session).not.toHaveProperty('refreshToken');

    // Also assert within browser context on localized endpoint
    const inBrowserSessionText = await browser.evaluate(async () => {
      const res = await fetch('/en/api/auth/session');
      return res.text();
    });
    expect(inBrowserSessionText).not.toContain('refreshToken');
    const inBrowserSession = JSON.parse(inBrowserSessionText);
    expect(inBrowserSession.user?.email).toBe('admin@mizano.com');
    expect(inBrowserSession.accessToken).toBeDefined();
    expect(inBrowserSession.refreshToken).toBeUndefined();

    // 5. Arabic RTL check on dashboard
    await app.open('/ar/dashboard');
    const dir = await browser.evaluate(() => document.documentElement.dir);
    expect(dir).toBe('rtl');
    await expect(screen.getByText('refreshToken: omitted')).toBeVisible();
  },
);
