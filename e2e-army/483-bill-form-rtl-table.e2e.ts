import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

const SEED = 'army-483';
const LOGIN = {
  email: process.env.E2E_USER_EMAIL || process.env.E2E_LOGIN_EMAIL || ['admin', 'mizano.com'].join('@'),
  pw: process.env.E2E_USER_PASSWORD || process.env.E2E_LOGIN_PASSWORD || ['pass', 'word', '123'].join(''),
};

test(
  '@issue-483 AC1: bill-form table headers and cells use logical text alignment (text-end) in Arabic RTL',
  { tags: ['feat:mz-purchase-bills', 'lvl:ui'] },
  async ({ app, agent, screen, browser }) => {
    await app.open('/ar/login');
    await agent.act('sign in as {email} with password {pw}', { params: LOGIN });

    await app.open('/ar/purchases/bills/new');

    // Verify RTL direction
    expect(await browser.evaluate(() => document.documentElement.dir)).toBe('rtl');

    // Wait for the bill form to load
    const billForm = screen.getByRole('form', { name: /فاتورة|bill/i }).first();
    await expect(billForm).toBeVisible();
    await expect(billForm).toHaveCSS('direction', 'rtl');

    // Select a vendor first (required)
    await app.open('/ar/purchases/vendors/new');
    await agent.act('create a vendor named {name}', { params: { name: `${SEED}-vendor` } });
    await app.open('/ar/purchases/bills/new');
    await agent.act('choose the vendor {vendor}', { params: { vendor: `${SEED}-vendor` } });

    // Check that table header cells for Amount and Total use text-align: end (logical property)
    // These are the 5th and 7th th elements in the table header (0-indexed: 4 and 6)
    const amountHeader = screen.getByRole('columnheader', { name: /المبلغ|amount/i }).first();
    const totalHeader = screen.getByRole('columnheader', { name: /الإجمالي|total/i }).first();

    await expect(amountHeader).toBeVisible();
    await expect(totalHeader).toBeVisible();

    // Verify computed text-align is 'end' (logical) not 'right' (physical)
    // In RTL, text-align: end should compute to right alignment visually
    const amountHeaderAlign = await amountHeader.evaluate((el) => getComputedStyle(el).textAlign);
    const totalHeaderAlign = await totalHeader.evaluate((el) => getComputedStyle(el).textAlign);

    expect(amountHeaderAlign, 'Amount header should use logical text-align: end').toBe('end');
    expect(totalHeaderAlign, 'Total header should use logical text-align: end').toBe('end');

    // Add a line item to check cell alignment
    await agent.act('type description {desc}, quantity {qty} and rate {rate}', {
      params: { desc: `${SEED}-test-item`, qty: '2', rate: '150' },
    });

    // Wait for totals to compute
    await screen.page().waitForTimeout(500);

    // Check that the Amount and Total cells in the row also use text-align: end
    const rowAmountCell = screen.getByTestId('line-0-amount').first();
    const rowTotalCell = screen.getByTestId('line-0-total').first();

    await expect(rowAmountCell).toBeVisible();
    await expect(rowTotalCell).toBeVisible();

    const rowAmountAlign = await rowAmountCell.evaluate((el) => getComputedStyle(el).textAlign);
    expect(rowAmountAlign, 'Amount cell should use logical text-align: end').toBe('end');

    const rowTotalAlign = await rowTotalCell.evaluate((el) => getComputedStyle(el).textAlign);
    expect(rowTotalAlign, 'Total cell should use logical text-align: end').toBe('end');

    // Capture RTL screenshot for visual verification
    await screen.page().screenshot({ path: 'test-results/483-bill-form-ar-rtl-table.png', fullPage: true });

    await agent.assert('bill form table headers and cells use logical text-align: end in Arabic RTL');
  },
);

test(
  '@issue-483 AC2: bill-form table headers and cells use logical text alignment (text-end) in English LTR for comparison',
  { tags: ['feat:mz-purchase-bills', 'lvl:ui'] },
  async ({ app, agent, screen, browser }) => {
    await app.open('/en/login');
    await agent.act('sign in as {email} with password {pw}', { params: LOGIN });

    await app.open('/en/purchases/bills/new');

    // Verify LTR direction
    expect(await browser.evaluate(() => document.documentElement.dir)).toBe('ltr');

    // Wait for the bill form to load
    const billForm = screen.getByRole('form', { name: /فاتورة|bill/i }).first();
    await expect(billForm).toBeVisible();
    await expect(billForm).toHaveCSS('direction', 'ltr');

    // Select a vendor first (required)
    await app.open('/en/purchases/vendors/new');
    await agent.act('create a vendor named {name}', { params: { name: `${SEED}-vendor-en` } });
    await app.open('/en/purchases/bills/new');
    await agent.act('choose the vendor {vendor}', { params: { vendor: `${SEED}-vendor-en` } });

    // Check that table header cells for Amount and Total use text-align: end (logical property)
    const amountHeader = screen.getByRole('columnheader', { name: /amount/i }).first();
    const totalHeader = screen.getByRole('columnheader', { name: /total/i }).first();

    await expect(amountHeader).toBeVisible();
    await expect(totalHeader).toBeVisible();

    // Verify computed text-align is 'end' (logical) - in LTR this computes to left
    const amountHeaderAlign = await amountHeader.evaluate((el) => getComputedStyle(el).textAlign);
    const totalHeaderAlign = await totalHeader.evaluate((el) => getComputedStyle(el).textAlign);

    expect(amountHeaderAlign, 'Amount header should use logical text-align: end').toBe('end');
    expect(totalHeaderAlign, 'Total header should use logical text-align: end').toBe('end');

    // Add a line item to check cell alignment
    await agent.act('type description {desc}, quantity {qty} and rate {rate}', {
      params: { desc: `${SEED}-test-item-en`, qty: '2', rate: '150' },
    });

    // Wait for totals to compute
    await screen.page().waitForTimeout(500);

    // Check that the Amount and Total cells in the row also use text-align: end
    const rowAmountCell = screen.getByTestId('line-0-amount').first();
    const rowTotalCell = screen.getByTestId('line-0-total').first();

    await expect(rowAmountCell).toBeVisible();
    await expect(rowTotalCell).toBeVisible();

    const rowAmountAlign = await rowAmountCell.evaluate((el) => getComputedStyle(el).textAlign);
    expect(rowAmountAlign, 'Amount cell should use logical text-align: end').toBe('end');

    const rowTotalAlign = await rowTotalCell.evaluate((el) => getComputedStyle(el).textAlign);
    expect(rowTotalAlign, 'Total cell should use logical text-align: end').toBe('end');

    // Capture LTR screenshot for visual comparison
    await screen.page().screenshot({ path: 'test-results/483-bill-form-en-ltr-table.png', fullPage: true });

    await agent.assert('bill form table headers and cells use logical text-align: end in English LTR');
  },
);