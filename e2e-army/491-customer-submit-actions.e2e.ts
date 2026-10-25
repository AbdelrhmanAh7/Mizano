import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

test(
  '@issue-491 AC1 AC2 AC3: customer create and update actions have distinct localized names',
  { tags: ['feat:mz-customers', 'lvl:ui'] },
  async ({ app, agent, screen, browser }) => {
    const email = process.env.E2E_LOGIN_EMAIL;
    const password = process.env.E2E_LOGIN_PASSWORD;
    if (!email || !password) throw new Error('Set throwaway E2E_LOGIN_EMAIL and E2E_LOGIN_PASSWORD');

    await app.open('/en/login');
    await screen.getByLabel('Email').fill(email);
    await screen.getByLabel('Password').fill(password);
    await screen.getByRole('button', 'Sign In', { exact: true }).tap();
    await expect(browser).toHaveURL(/\/en\/dashboard(?:[/?#]|$)/);

    for (const [locale, direction, create] of [
      ['en', 'ltr', 'Create Customer'],
      ['ar', 'rtl', 'إنشاء عميل'],
    ]) {
      await app.open(`/${locale}/sales/customers/new`);
      expect(await browser.evaluate(() => document.documentElement.dir)).toBe(direction);
      await expect(screen.getByRole('button', create, { exact: true })).toBeVisible();
      await screen.getByRole('button', create, { exact: true }).tap();
      await expect(screen.getByText('Customer name is required', { exact: true })).toBeVisible();
      await expect(browser).toHaveURL(new RegExp(`/${locale}/sales/customers/new$`));
      await app.screenshot(`491-create-${locale}-${direction}`);
    }

    await app.open('/en/sales/customers/new');
    await agent.act('enter army-customer-actions-491 as the customer name');
    await screen.getByRole('button', 'Create Customer', { exact: true }).tap();
    await expect(browser).toHaveURL(/\/sales\/customers$/);
    await screen.getByRole('link', 'army-customer-actions-491', { exact: true }).tap();
    const customerPath = await browser.evaluate(() => window.location.pathname);
    const customerId = customerPath.split('/').pop();
    if (!customerId || customerId === 'customers') throw new Error('Customer detail did not open');

    for (const [locale, direction, update, create] of [
      ['en', 'ltr', 'Update Customer', 'Create Customer'],
      ['ar', 'rtl', 'تحديث العميل', 'إنشاء عميل'],
    ]) {
      await app.open(`/${locale}/sales/customers/${customerId}/edit`);
      expect(await browser.evaluate(() => document.documentElement.dir)).toBe(direction);
      await expect(screen.getByRole('button', update, { exact: true })).toBeVisible();
      await expect(screen.getByRole('button', create, { exact: true })).toHaveCount(0);
      await agent.assert('the submit action clearly updates the existing customer in the page language');
      await app.screenshot(`491-update-${locale}-${direction}`);
    }
  },
);
