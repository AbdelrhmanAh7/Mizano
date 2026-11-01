import { randomBytes } from 'node:crypto';
import { expect, type Page } from '@playwright/test';
import { API_URL } from '../env';

export type Account = {
  email: string;
  password: string;
  organizationName: string;
  accessToken: string;
};

/** A fresh organization with its owner: a unique *.example.test address and a random password, nothing shared. */
export async function registerAccount(
  label = 'owner',
  country: 'EG' | 'SA' | 'AE' = 'EG',
): Promise<Account> {
  const id = `${Date.now().toString(36)}${randomBytes(3).toString('hex')}`;
  const email = `e2e-${label}-${id}@example.test`;
  const password = `Pw1-${randomBytes(9).toString('base64url')}`;
  const organizationName = `Journey ${label} ${id}`;
  const res = await fetch(`${API_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      password,
      firstName: 'Mona',
      lastName: 'Tester',
      organizationName,
      country,
    }),
  });
  if (!res.ok)
    throw new Error(`Could not register the test account (${res.status}): ${await res.text()}`);
  const body = (await res.json()) as {
    data?: { tokens?: { accessToken?: string } };
    tokens?: { accessToken?: string };
  };
  const accessToken = body.data?.tokens?.accessToken ?? body.tokens?.accessToken ?? '';
  return { email, password, organizationName, accessToken };
}

/** Signs in through the real sign-in form and waits for the dashboard. */
export async function signIn(
  page: Page,
  account: Account,
  locale: 'en' | 'ar' = 'en',
): Promise<void> {
  await page.goto(`/${locale}/login`);
  await page.waitForLoadState('networkidle');
  await page.getByLabel(/email|البريد/i).fill(account.email);
  await page.locator('input[type="password"]').fill(account.password);
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(new RegExp(`/${locale}/dashboard`), { timeout: 60_000 });
}
