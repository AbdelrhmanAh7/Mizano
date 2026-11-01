import { expect, test } from '@playwright/test';
import { registerAccount, signIn, type Account } from '../support/account';
import * as api from '../support/api';

/** A new organization with a customer, a sent invoice of EGP 1,000, a 400 payment and a 100 credit note. */
async function seeded(): Promise<{
  account: Account;
  customer: { id: string };
  invoice: { id: string };
  creditNote: { id: string };
}> {
  const account = await registerAccount('money');
  const customer = await api.createCustomer(account);
  const invoice = await api.createSentInvoice(account, customer.id);
  await api.recordPayment(account, invoice.id, '400');
  const creditNote = await api.createCreditNote(account, customer.id, invoice.id, '100');
  return { account, customer, invoice, creditNote };
}

test.describe('money flows', () => {
  test('create a customer in the form: it is listed @happy', async ({ page }) => {
    const account = await registerAccount('customer');
    await signIn(page, account);
    await page.goto('/en/sales/customers/new');
    await page.waitForLoadState('networkidle');
    await page.locator('input[name="name"]').fill('Nile Traders');
    await page.locator('input[name="email"]').fill('nile@example.test');
    await page.getByRole('button', { name: /create customer|save/i }).click();
    await expect(page).toHaveURL(/\/en\/sales\/customers$/, { timeout: 30_000 });
    // After saving, the app opens the customer list with the new row in it.
    await expect(page.getByRole('row', { name: /Nile Traders.*nile@example\.test/ })).toBeVisible();
  });

  test('create an invoice in the form: it is listed as a draft with its total @happy', async ({
    page,
  }) => {
    const account = await registerAccount('invoice');
    await api.createCustomer(account);
    await signIn(page, account);
    await page.goto('/en/sales/invoices/new');
    await page.waitForLoadState('networkidle');
    await page.getByRole('combobox', { name: 'Customer *' }).click();
    await page.getByRole('option', { name: 'Nile Traders' }).click();
    await page.getByRole('textbox', { name: 'Description' }).first().fill('Consulting');
    await page.getByRole('spinbutton').nth(0).fill('2');
    await page.getByRole('spinbutton').nth(1).fill('500');
    await expect(page.getByText('Grand Total').locator('..')).toContainText('1,000.00');
    await page.getByRole('button', { name: 'Create Invoice' }).click();
    await expect(page).toHaveURL(/\/en\/sales\/invoices\/[^/]+$/, { timeout: 30_000 });
    await expect(page.getByText('EGP 1,000.00').first()).toBeVisible();
    await expect(page.getByText('Nile Traders').first()).toBeVisible();
    await expect(page.getByText('Draft', { exact: true }).first()).toBeVisible();
  });

  test('a part payment leaves the right balance and shows in the payment history @happy', async ({
    page,
  }) => {
    const { account, invoice } = await seeded();
    await signIn(page, account);
    await page.goto(`/en/sales/invoices/${invoice.id}`);
    await expect(page.getByText('Partially Paid').first()).toBeVisible();
    await expect(page.getByText('Balance Due').locator('..')).toContainText('EGP 500.00');
    await expect(page.getByText('PMT-001')).toBeVisible();
  });

  test('a credit note is posted and shows the customer balance after it @happy', async ({
    page,
  }) => {
    const { account, creditNote } = await seeded();
    await signIn(page, account);
    await page.goto(`/en/sales/credit-notes/${creditNote.id}`);
    await expect(page.getByText('Posted', { exact: true })).toBeVisible();
    await expect(page.getByText('Customer balance after this credit').locator('..')).toContainText(
      'EGP 500.00',
    );
  });

  // Issue #656: the invoice's Credit Notes table renders `total` (null) instead of `amount`, so it shows EGP 0.00.
  test.fixme('the invoice page lists its credit note with the right amount @happy', async ({
    page,
  }) => {
    const { account, invoice } = await seeded();
    await signIn(page, account);
    await page.goto(`/en/sales/invoices/${invoice.id}`);
    await expect(page.getByRole('row', { name: /CN-001/ })).toContainText('EGP 100.00');
  });

  test('a vendor bill opens and is listed with its balance @happy', async ({ page }) => {
    const account = await registerAccount('bill');
    const vendor = await api.createVendor(account);
    await api.createOpenBill(account, vendor.id);
    await signIn(page, account);
    await page.goto('/en/purchases/bills');
    const row = page.getByRole('row', { name: /Delta Supplies/ });
    await expect(row).toContainText('Open');
    await expect(row).toContainText('EGP 300.00');
  });

  test('the trial balance balances after invoice, payment, credit note and bill @happy', async ({
    page,
  }) => {
    const { account } = await seeded();
    const vendor = await api.createVendor(account);
    await api.createOpenBill(account, vendor.id);
    await signIn(page, account);
    await page.goto('/en/accounting/trial-balance');
    await expect(page.getByText('Balanced', { exact: true })).toBeVisible();
    // Debit is the fourth column, credit the fifth: exact cells, so 1,500.00 can never satisfy 500.00.
    await expect(
      page
        .getByRole('row', { name: /Accounts Receivable/ })
        .getByRole('cell')
        .nth(3),
    ).toHaveText('500.00');
    await expect(
      page
        .getByRole('row', { name: /Accounts Payable/ })
        .getByRole('cell')
        .nth(4),
    ).toHaveText('300.00');
    const total = page.getByRole('row', { name: /^Total/ });
    await expect(total).toContainText('1,300.00');
  });

  test('bank reconciliation opens for a new organization @happy', async ({ page }) => {
    await signIn(page, await registerAccount('bank'));
    await page.goto('/en/banking/reconcile');
    await expect(page.getByText('Page Not Found')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: /reconcil/i }).first()).toBeVisible();
    await expect(page.getByRole('alert').filter({ hasText: /\S/ })).toHaveCount(0);
  });

  test('on a 390 px phone the menu opens and Customers opens without sideways scrolling @happy', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await signIn(page, await registerAccount('phone'));
    await page.getByRole('button', { name: 'Open menu' }).click();
    await page.getByRole('button', { name: 'Sales' }).click();
    await page.getByRole('link', { name: 'Customers' }).click();
    await expect(page).toHaveURL(/\/en\/sales\/customers/);
    await expect(page.getByRole('heading', { name: 'Customers', level: 1 })).toBeVisible();
    await expect(page.getByText('No customers yet').or(page.getByRole('table'))).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, 'page is wider than the screen').toBeLessThanOrEqual(1);
  });
});
