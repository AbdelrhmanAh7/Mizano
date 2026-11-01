import { chromium } from '@playwright/test';
import { WEB_URL } from './env';
import { registerAccount, signIn } from './support/account';

/**
 * Warms the dev servers once before the journeys: Next compiles each page the first time it is asked for, and
 * the first tests would otherwise race that compile (sign-in landing back on the login page, 20 s page loads).
 */
export default async function globalSetup(): Promise<void> {
  const account = await registerAccount('warmup');
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ baseURL: WEB_URL });
    await page.goto('/en/register');
    await signIn(page, account);
    for (const path of [
      'sales/customers',
      'sales/customers/new',
      'sales/invoices',
      'sales/invoices/new',
      'sales/credit-notes',
      'purchases/bills',
      'accounting/trial-balance',
      'banking/reconcile',
    ]) {
      await page.goto(`/en/${path}`);
      await page.waitForLoadState('networkidle');
    }
    await page.goto('/en/login?callbackUrl=%2Fen%2Fdashboard');
  } finally {
    await browser.close();
  }
}
