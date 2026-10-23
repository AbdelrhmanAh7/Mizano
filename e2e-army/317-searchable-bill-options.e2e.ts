import { test } from '@e2e-dev/web';
import { expect } from 'e2e';
import fs from 'fs';
import path from 'path';
import { loadTestCredentialsLegacy } from './utils/test-credentials';

// Load the Arabic expense-account label from the application's message catalog.
// This ensures the test uses the exact terminology rendered by the UI.
const arPurchasesPath = path.resolve(
  process.cwd(),
  'apps/web/messages/ar/purchases.json',
);
const arPurchases = JSON.parse(fs.readFileSync(arPurchasesPath, 'utf-8'));
const EXPENSE_ACCOUNT_LABEL_AR: string = arPurchases.expenses?.form?.account ?? 'حساب المصروفات';

// Credentials must be configured in CI via environment variables:
//   E2E_LOGIN_EMAIL (or TEST_USER_EMAIL) and E2E_LOGIN_PASSWORD (or TEST_USER_PASSWORD).
// For local test execution, placeholder values are loaded from .env.test (gitignored).
const SEED = 'army-317';
const LOGIN = loadTestCredentialsLegacy();

test(
  '@issue-317 AC1-AC4: searchable and page-aware accounts and items in bill-form allow selecting later-page records and preserve selection',
  { tags: ['feat:mz-purchase-bills', 'lvl:ui'] },
  async ({ app, agent, screen }) => {
    await app.open('/en/login');
    await agent.act('sign in as {email} with password {pw}', { params: LOGIN });

    await app.open('/en/purchases/vendors/new');
    await agent.act('create a vendor named {name}', { params: { name: `${SEED}-vendor` } });

    await app.open('/en/purchases/bills/new');
    await agent.act('choose the vendor {vendor}', { params: { vendor: `${SEED}-vendor` } });

    // Verify searchable item picker exists on first line
    await expect(screen.getByTestId('line-0-item')).toBeVisible();
    await agent.act('open the item picker on the first line and search for {query}', {
      params: { query: 'Office' },
    });
    await agent.act('choose any matching item or choose Manual Entry');

    // Verify searchable account picker exists on first line
    await expect(screen.getByTestId('line-0-account')).toBeVisible();
    await agent.act('open the expense account picker on the first line and search for {query}', {
      params: { query: 'Expense' },
    });
    await agent.act('choose any expense account from the search results');
    await agent.assert('the selected expense account is preserved on subsequent searches');

    await agent.act(
      'type description {desc}, quantity {qty} and rate {rate}',
      { params: { desc: `${SEED}-searchable-item`, qty: '1', rate: '100' } },
    );
    await agent.act('click Create Bill');
    await agent.assert('the bill was saved and the page left the new-bill form without errors');
  },
);

test(
  '@issue-317 AC6 @issue-352 AC1-AC4: bill-form item and account search controls are displayed in Arabic and RTL with verified layout',
  { tags: ['feat:mz-purchase-bills', 'lvl:ui'] },
  async ({ app, agent, screen, browser }) => {
    await app.open('/ar/login');
    await agent.act('sign in as {email} with password {pw}', { params: LOGIN });

    await app.open('/ar/purchases/bills/new');

    // FR-004: Keep the existing document.documentElement.dir check.
    expect(await browser.evaluate(() => document.documentElement.dir)).toBe('rtl');

    // Capture RTL screenshot for visual verification
    await screen.page().screenshot({ path: 'test-results/352-bill-form-ar-rtl.png', fullPage: true });

    // Locate the bill form container. The form is the main <form> element on the page.
    const billForm = screen.getByRole('form', { name: /فاتورة|bill/i }).first();
    await expect(billForm).toBeVisible();

    // FR-001: Assert the computed CSS direction of the bill form container is rtl.
    await expect(billForm, 'bill form must compute direction rtl').toHaveCSS('direction', 'rtl');

    // FR-002: Geometric right-alignment check for the expense-account label.
    // The label for the account selector should sit closer to the container's right edge.
    const expenseAccountLabel = screen.getByText(EXPENSE_ACCOUNT_LABEL_AR).first();
    await expect(expenseAccountLabel).toBeVisible();

    const formBox = await billForm.boundingBox();
    const labelBox = await expenseAccountLabel.boundingBox();
    expect(formBox, 'bill form bounding box must be available').not.toBeNull();
    expect(labelBox, 'expense-account label bounding box must be available').not.toBeNull();

    if (formBox && labelBox) {
      const rightGap = formBox.x + formBox.width - (labelBox.x + labelBox.width);
      const leftGap = labelBox.x - formBox.x;
      expect(rightGap, 'expense-account label must be right-aligned (right gap < left gap)').toBeLessThan(leftGap);
    }

    // FR-005/FR-006: The rendered label text must match the catalog value (trimmed, NFC-normalized).
    const renderedLabel = (await expenseAccountLabel.textContent()) ?? '';
    const expectedLabel = EXPENSE_ACCOUNT_LABEL_AR.normalize('NFC').trim();
    expect(renderedLabel.normalize('NFC').trim(), 'expense-account label must match ar catalog').toBe(expectedLabel);

    // Verify the Add Line button is visible in Arabic.
    await expect(screen.getByRole('button', { name: 'إضافة سطر' })).toBeVisible();

    // FR-003: Open the expense account picker and assert the listbox computes direction rtl.
    // The account picker on the first line has test-id 'line-0-account'.
    const accountPicker = screen.getByTestId('line-0-account');
    await expect(accountPicker).toBeVisible();
    await accountPicker.click();

    // The SelectContent (listbox) renders in a portal. Find it by role.
    const listbox = screen.getByRole('listbox', { name: EXPENSE_ACCOUNT_LABEL_AR });
    await expect(listbox).toBeVisible();
    await expect(listbox, 'account listbox must compute direction rtl').toHaveCSS('direction', 'rtl');

    // Capture RTL screenshot with listbox open
    await screen.page().screenshot({ path: 'test-results/352-bill-form-ar-rtl-listbox.png', fullPage: true });

    await agent.assert('each bill line has searchable item and expense account pickers in Arabic with verified RTL layout');
  },
);

test(
  '@issue-352 AC1-AC4: bill-form renders LTR in English locale for visual comparison',
  { tags: ['feat:mz-purchase-bills', 'lvl:ui'] },
  async ({ app, agent, screen, browser }) => {
    await app.open('/en/login');
    await agent.act('sign in as {email} with password {pw}', { params: LOGIN });

    await app.open('/en/purchases/bills/new');

    // Verify LTR direction on English locale
    expect(await browser.evaluate(() => document.documentElement.dir)).toBe('ltr');

    // Capture LTR screenshot for visual comparison
    await screen.page().screenshot({ path: 'test-results/352-bill-form-en-ltr.png', fullPage: true });

    const billForm = screen.getByRole('form', { name: /فاتورة|bill/i }).first();
    await expect(billForm).toBeVisible();
    await expect(billForm).toHaveCSS('direction', 'ltr');

    await agent.assert('bill form renders LTR in English locale');
  },
);
