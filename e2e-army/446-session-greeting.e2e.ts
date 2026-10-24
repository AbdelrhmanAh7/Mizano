import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

test(
  '@issue-446 AC1 AC2 AC3: the dashboard greets the signed-in session user in English and Arabic',
  { tags: ['feat:mz-auth', 'lvl:ui'] },
  async ({ app, screen, browser }) => {
    // Public demo credentials are only for the runner's throwaway seeded database.
    const email = process.env.E2E_USER_EMAIL || 'admin@mizano.com';
    const password = process.env.E2E_USER_PASSWORD || 'password123';

    await app.open('/en/login');
    await screen.getByLabel('Email').fill(email);
    await screen.getByLabel('Password').fill(password);
    await screen.getByRole('button', 'Sign In').tap();
    await expect(browser).toHaveURL(/\/en\/dashboard(?:[/?#]|$)/, { timeout: 40_000 });

    // Return only the identity fields needed here, never session tokens.
    const session = await browser.evaluate(async () => {
      const response = await fetch('/api/auth/session');
      if (!response.ok) throw new Error('Session request failed');
      const body = await response.json();
      if (typeof body?.user?.firstName !== 'string' || !body.user.firstName.trim()) {
        throw new Error('Session user firstName must be a non-empty string');
      }
      return { user: { firstName: body.user.firstName, email: body.user.email } };
    });
    expect(session.user.email).toBe(email);

    for (const [locale, direction, greeting] of [
      ['en', 'ltr', 'Welcome back, '],
      ['ar', 'rtl', 'مرحباً بعودتك، '],
    ]) {
      await app.open(`/${locale}/dashboard`);
      expect(await browser.evaluate(() => document.documentElement.dir)).toBe(direction);
      await expect(
        screen.getByRole('heading', `${greeting}${session.user.firstName}`, { exact: true }),
      ).toBeVisible();
      await app.screenshot(`446-session-greeting-${locale}-${direction}`);
    }
  },
);
