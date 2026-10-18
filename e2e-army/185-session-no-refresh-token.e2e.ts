import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

test(
  '@issue-185 AC1: the authenticated /api/auth/session JSON carries no refreshToken',
  { tags: ['feat:mz-auth', 'lvl:api'] },
  async ({ app, screen, browser }) => {
    // Demo admin sign-in through the form (throwaway seeded DB). Retried because a submit
    // before hydration is a plain GET in next dev.
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

    // Same-origin GET with the session cookie: the browser shows the raw JSON body.
    await app.open('/api/auth/session');
    const body = await browser.evaluate(() => document.body.innerText);
    const session = JSON.parse(body) as { user?: { email?: string } } & Record<string, unknown>;

    // Still a real signed-in session...
    expect(session.user?.email).toBe('admin@mizano.com');
    // ...but the refresh token never reaches the browser.
    expect(Object.keys(session)).not.toContain('refreshToken');
    expect(body).not.toContain('refreshToken');
  },
);
