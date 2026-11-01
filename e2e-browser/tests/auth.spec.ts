import { randomBytes } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { API_URL } from '../env';
import { registerAccount, signIn } from '../support/account';

test.describe('sign up and sign in', () => {
  test('a new owner signs up in the form and reaches the dashboard @happy', async ({ page }) => {
    const id = randomBytes(4).toString('hex');
    await page.goto('/en/register');
    await page.waitForLoadState('networkidle');
    await page.locator('input[name="firstName"]').fill('Mona');
    await page.locator('input[name="lastName"]').fill('Tester');
    const email = `e2e-signup-${id}@example.test`;
    await page.locator('input[name="email"]').fill(email);
    await page.locator('input[name="organizationName"]').fill(`Journey Signup ${id}`);
    const password = `Pw1-${randomBytes(9).toString('base64url')}`;
    await page.locator('input[name="password"]').fill(password);
    await page.locator('input[name="confirmPassword"]').fill(password);
    await page.locator('button[type="submit"]').click();
    await expect(page).toHaveURL(/\/en\/dashboard$/, { timeout: 60_000 });
    await expect(page.locator('main')).toBeVisible();
    // The new owner really exists: the same email and password sign in against the API.
    const login = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    expect(login.status).toBeLessThan(300);
    const session = JSON.stringify(await login.json());
    expect(session).toContain(email);
    expect(session).toContain('Mona');
  });

  test('a wrong password gives an error and nobody is signed in @edge', async ({ page }) => {
    const account = await registerAccount('wrongpw');
    await page.goto('/en/login');
    await page.waitForLoadState('networkidle');
    await page.getByLabel(/email/i).fill(account.email);
    await page.locator('input[type="password"]').fill(`${account.password}-nope`);
    await page.locator('button[type="submit"]').click();
    await expect(page.getByText('Invalid email or password', { exact: true })).toBeVisible();
    await expect(page).toHaveURL(/\/en\/login/);
    await page.goto('/en/dashboard');
    await expect(page).toHaveURL(/\/en\/login/);
  });

  test('sign in, sign out, and the dashboard closes again @happy', async ({ page }) => {
    const account = await registerAccount('inout');
    await signIn(page, account);
    await page.getByRole('button', { name: 'Profile', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Sign out', exact: true }).click();
    await expect(page).toHaveURL(/\/en\/login/);
    await page.goto('/en/dashboard');
    await expect(page).toHaveURL(/\/en\/login/);
  });

  test('the language switch turns the sign-in page Arabic, right to left @happy', async ({
    page,
  }) => {
    await page.goto('/en/login');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
    await page.getByRole('button', { name: 'Language' }).click();
    await page.getByRole('menuitem', { name: /العربية|arabic/i }).click();
    await expect(page).toHaveURL(/\/ar\/login/);
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  });
});
