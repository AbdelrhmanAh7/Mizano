import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { registerAccount, signIn } from '../support/account';
import * as api from '../support/api';

/**
 * Design system (docs/DESIGN-SYSTEM.md): every text on the main signed-in screens reaches WCAG AA
 * contrast with the tokens, in Arabic on a phone and English on a desktop. Status pills (Sent,
 * Partially paid …), links and primary buttons are on these screens.
 */
const RUNS = [
  { locale: 'ar' as const, width: 390, height: 844 },
  { locale: 'en' as const, width: 1440, height: 900 },
];

for (const run of RUNS) {
  test(`app screens have readable contrast, ${run.locale} ${run.width}px @happy`, async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const account = await registerAccount('contrast');
    const customer = await api.createCustomer(account);
    const invoice = await api.createSentInvoice(account, customer.id);
    await api.recordPayment(account, invoice.id, '1');
    await page.setViewportSize({ width: run.width, height: run.height });
    await signIn(page, account, run.locale);

    for (const path of ['/dashboard', '/sales/invoices', `/sales/invoices/${invoice.id}`]) {
      await page.goto(`/${run.locale}${path}`);
      await page.waitForLoadState('networkidle');
      await expect(page.locator('main')).toBeVisible();
      const { violations } = await new AxeBuilder({ page })
        .include('main')
        .withRules(['color-contrast'])
        .analyze();
      const found = violations.flatMap((v) =>
        v.nodes.map((n) => `${path}: ${n.target.join(' ')} (${n.failureSummary ?? ''})`),
      );
      expect(found).toEqual([]);
    }
  });
}
