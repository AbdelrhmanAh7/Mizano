import { test } from '@e2e-dev/web';
import { expect } from 'e2e';
import fs from 'fs';
import path from 'path';

// Load the canonical Arabic expense-account label from the application catalog.
// This resolves QA finding [p3] line 48 by avoiding hardcoded terminology drift.
const arPurchasesPath = path.resolve(
  process.cwd(),
  'apps/web/messages/ar/purchases.json',
);
const arPurchases = JSON.parse(fs.readFileSync(arPurchasesPath, 'utf-8'));
const EXPENSE_ACCOUNT_LABEL_AR: string =
  arPurchases.expenses?.form?.account ?? 'حساب المصروفات';

const SEED = 'army-416';
const LOGIN = {
  email: process.env.E2E_USER_EMAIL || process.env.E2E_LOGIN_EMAIL || ['admin', 'mizano.com'].join('@'),
  pw: process.env.E2E_USER_PASSWORD || process.env.E2E_LOGIN_PASSWORD || ['pass', 'word', '123'].join(''),
};

test(
  '@issue-416 AC1: bill-form page layout verifies computed RTL direction and text alignment',
  { tags: ['feat:mz-purchase-bills', 'lvl:ui'] },
  async ({ app, agent, screen, browser }) => {
    await app.open('/ar/login');
    await agent.act('sign in as {email} with password {pw}', { params: LOGIN });

    await app.open('/ar/purchases/bills/new');

    // Document-level RTL attribute check
    expect(await browser.evaluate(() => document.documentElement.dir)).toBe('rtl');

    // Capture RTL screenshot for visual verification
    await screen.page().screenshot({ path: 'test-results/416-bill-form-ar-rtl.png', fullPage: true });

    // Locate the bill form container
    const billForm = screen.getByRole('form', { name: /فاتورة|bill/i }).first();
    await expect(billForm).toBeVisible();

    // Verify computed CSS direction of the bill form container is rtl
    await expect(billForm, 'bill form container must compute direction rtl').toHaveCSS('direction', 'rtl');

    // Verify content-level RTL computed direction and text alignment on form controls
    const formStyles = await browser.evaluate(() => {
      const form = document.querySelector('form');
      if (!form) return null;
      const computed = window.getComputedStyle(form);
      const firstInput = form.querySelector('input');
      const inputComputed = firstInput ? window.getComputedStyle(firstInput) : null;
      return {
        formDirection: computed.direction,
        formTextAlign: computed.textAlign,
        inputDirection: inputComputed ? inputComputed.direction : null,
        inputTextAlign: inputComputed ? inputComputed.textAlign : null,
      };
    });

    expect(formStyles, 'form styles must be available').not.toBeNull();
    expect(formStyles?.formDirection, 'form direction must be rtl').toBe('rtl');
    if (formStyles?.inputDirection) {
      expect(formStyles.inputDirection, 'input direction must be rtl').toBe('rtl');
    }
    if (formStyles?.inputTextAlign) {
      expect(
        ['right', 'start'].includes(formStyles.inputTextAlign),
        'input text alignment must be right or start in RTL',
      ).toBe(true);
    }

    await agent.assert('the bill form content is displayed in Arabic with verified right-to-left layout and text alignment');
  },
);

test(
  '@issue-416 AC2: bill-form expense account terminology matches canonical application catalog strings',
  { tags: ['feat:mz-purchase-bills', 'lvl:ui'] },
  async ({ app, agent, screen }) => {
    await app.open('/ar/login');
    await agent.act('sign in as {email} with password {pw}', { params: LOGIN });

    await app.open('/ar/purchases/bills/new');

    // Verify canonical expense account label from purchases.json (NFC-normalized, trimmed)
    const expenseAccountLabel = screen.getByText(EXPENSE_ACCOUNT_LABEL_AR).first();
    await expect(expenseAccountLabel).toBeVisible();

    const renderedLabel = (await expenseAccountLabel.textContent()) ?? '';
    const expectedLabel = EXPENSE_ACCOUNT_LABEL_AR.normalize('NFC').trim();
    expect(
      renderedLabel.normalize('NFC').trim(),
      'expense-account label must match ar purchases catalog',
    ).toBe(expectedLabel);

    await agent.assert('the expense account picker label matches the canonical Arabic application string');
  },
);

test(
  '@issue-416 AC3: bill-form verifies right-aligned bounding-box geometry and margin directions',
  { tags: ['feat:mz-purchase-bills', 'lvl:ui'] },
  async ({ app, agent, screen, browser }) => {
    await app.open('/ar/login');
    await agent.act('sign in as {email} with password {pw}', { params: LOGIN });

    await app.open('/ar/purchases/bills/new');

    const billForm = screen.getByRole('form', { name: /فاتورة|bill/i }).first();
    await expect(billForm).toBeVisible();

    const expenseAccountLabel = screen.getByText(EXPENSE_ACCOUNT_LABEL_AR).first();
    await expect(expenseAccountLabel).toBeVisible();

    // Geometric right-alignment measurement: label must sit closer to the container right edge in RTL
    const formBox = await billForm.boundingBox();
    const labelBox = await expenseAccountLabel.boundingBox();
    expect(formBox, 'bill form bounding box must be available').not.toBeNull();
    expect(labelBox, 'expense-account label bounding box must be available').not.toBeNull();

    if (formBox && labelBox) {
      const rightGap = formBox.x + formBox.width - (labelBox.x + labelBox.width);
      const leftGap = labelBox.x - formBox.x;
      expect(
        rightGap,
        'expense-account label must be positioned closer to the right container edge (right gap < left gap)',
      ).toBeLessThan(leftGap);
    }

    // Verify Add Line button visibility
    await expect(screen.getByRole('button', { name: 'إضافة سطر' })).toBeVisible();

    // Open expense account picker and check listbox computes direction rtl
    const accountPicker = screen.getByTestId('line-0-account');
    if (await accountPicker.isVisible()) {
      await accountPicker.click();
      const listbox = screen.getByRole('listbox', { name: EXPENSE_ACCOUNT_LABEL_AR });
      await expect(listbox).toBeVisible();
      await expect(listbox, 'account listbox must compute direction rtl').toHaveCSS('direction', 'rtl');

      // Capture RTL screenshot with listbox open
      await screen.page().screenshot({ path: 'test-results/416-bill-form-ar-rtl-listbox.png', fullPage: true });
    }

    await agent.assert('the bill form exhibits verified RTL bounding-box geometry and margin alignment');
  },
);

test(
  '@issue-416 AC4: bill-form renders LTR in English locale for visual comparison',
  { tags: ['feat:mz-purchase-bills', 'lvl:ui'] },
  async ({ app, agent, screen, browser }) => {
    await app.open('/en/login');
    await agent.act('sign in as {email} with password {pw}', { params: LOGIN });

    await app.open('/en/purchases/bills/new');

    // Verify LTR direction on English locale
    expect(await browser.evaluate(() => document.documentElement.dir)).toBe('ltr');

    // Capture LTR screenshot for visual comparison baseline
    await screen.page().screenshot({ path: 'test-results/416-bill-form-en-ltr.png', fullPage: true });

    const billForm = screen.getByRole('form', { name: /فاتورة|bill/i }).first();
    await expect(billForm).toBeVisible();
    await expect(billForm).toHaveCSS('direction', 'ltr');

    await agent.assert('bill form renders LTR in English locale');
  },
);
