import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

test(
  '@issue-332 AC1 AC2: NextAuth session endpoint omits refreshToken for authenticated and unauthenticated sessions',
  { tags: ['feat:mz-auth'] },
  async ({ app, screen, browser }) => {
    // 1. Unauthenticated request: returns empty session without refreshToken
    const anonRes = await fetch(new URL('/api/auth/session', app.baseUrl));
    expect(anonRes.status).toBe(200);
    const anonBody = await anonRes.json();
    expect(anonBody).toEqual({});
    expect(JSON.stringify(anonBody)).not.toContain('refreshToken');

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

    // Forward the session cookie to the NextAuth /api/auth/session endpoint
    const cookies = await browser.cookies();
    const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join('; ');

    const sessionRes = await fetch(new URL('/api/auth/session', app.baseUrl), {
      headers: { cookie: cookieHeader },
    });
    expect(sessionRes.status).toBe(200);
    const text = await sessionRes.text();
    expect(text).not.toContain('refreshToken');

    const session = JSON.parse(text) as {
      user?: { email?: string; id?: string };
      accessToken?: string;
      refreshToken?: string;
    };
    expect(session.user?.email).toBe('admin@mizano.com');
    expect(session.accessToken).toBeDefined();
    expect(session.refreshToken).toBeUndefined();
    expect(session).not.toHaveProperty('refreshToken');

    // Also assert within browser context
    const inBrowserSessionText = await browser.evaluate(async () => {
      const res = await fetch('/api/auth/session');
      return res.text();
    });
    expect(inBrowserSessionText).not.toContain('refreshToken');
    const inBrowserSession = JSON.parse(inBrowserSessionText);
    expect(inBrowserSession.user?.email).toBe('admin@mizano.com');
    expect(inBrowserSession.accessToken).toBeDefined();
    expect(inBrowserSession.refreshToken).toBeUndefined();
  },
);
