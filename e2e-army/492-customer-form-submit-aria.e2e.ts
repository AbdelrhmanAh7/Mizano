import { test } from '@e2e-dev/web';
import { expect } from 'e2e';
import fs from 'fs';
import path from 'path';

// Load the Arabic labels from the application's message catalog
const arSalesPath = path.resolve(
  process.cwd(),
  'apps/web/messages/ar/sales.json',
);
const arSales = JSON.parse(fs.readFileSync(arSalesPath, 'utf-8'));
const CREATE_CUSTOMER_LABEL_AR: string = arSales.customers?.form?.submitCreate ?? 'إنشاء عميل';
const UPDATE_CUSTOMER_LABEL_AR: string = arSales.customers?.form?.submitUpdate ?? 'تحديث العميل';

// Require E2E credentials via env vars; fail clearly if missing
const E2E_EMAIL = process.env.E2E_USER_EMAIL ?? process.env.E2E_LOGIN_EMAIL;
const E2E_PASSWORD = process.env.E2E_USER_PASSWORD ?? process.env.E2E_LOGIN_PASSWORD;
if (!E2E_EMAIL || !E2E_PASSWORD) {
  throw new Error('E2E_USER_EMAIL/E2E_LOGIN_EMAIL and E2E_USER_PASSWORD/E2E_LOGIN_PASSWORD must be set');
}
const LOGIN = { email: E2E_EMAIL, pw: E2E_PASSWORD };

const SEED = 'army-492';

test(
  '@issue-492 AC1: customer form submit button shows "Create Customer" in English create mode',
  { tags: ['feat:mz-customers', 'lvl:ui'] },
  async ({ app, agent, screen, browser }) => {
    await app.open('/en/login');
    await agent.act('sign in as {email} with password {pw}', { params: LOGIN });

    await app.open('/en/sales/customers/new');

    // Verify LTR direction on English locale
    expect(await browser.evaluate(() => document.documentElement.dir)).toBe('ltr');

    // Check the submit button has correct text and aria-label for create mode
    const submitButton = screen.getByRole('button', { name: /create customer/i });
    await expect(submitButton).toBeVisible();
    await expect(submitButton).toHaveAttribute('type', 'submit');
    await expect(submitButton).toHaveAttribute('aria-label', 'Create Customer');
  },
);

test(
  '@issue-492 AC2: customer form submit button shows "Update Customer" in English update mode',
  { tags: ['feat:mz-customers', 'lvl:ui'] },
  async ({ app, agent, screen, browser }) => {
    await app.open('/en/login');
    await agent.act('sign in as {email} with password {pw}', { params: LOGIN });

    // First create a customer to edit
    await app.open('/en/sales/customers/new');
    await agent.act('fill customer name with {name}', { params: { name: `${SEED}-test-customer` } });
    await agent.act('click Create Customer');
    await agent.assert('the customer was created and we are on the customer list or detail page');

    // Navigate to edit the customer
    await app.open('/en/sales/customers');
    await agent.act('click the edit button for the customer named {name}', { params: { name: `${SEED}-test-customer` } });

    // Verify LTR direction
    expect(await browser.evaluate(() => document.documentElement.dir)).toBe('ltr');

    // Check the submit button has correct text and aria-label for update mode
    const submitButton = screen.getByRole('button', { name: /update customer/i });
    await expect(submitButton).toBeVisible();
    await expect(submitButton).toHaveAttribute('type', 'submit');
    await expect(submitButton).toHaveAttribute('aria-label', 'Update Customer');
  },
);

test(
  '@issue-492 AC3: customer form submit button shows correct Arabic labels in RTL create mode',
  { tags: ['feat:mz-customers', 'lvl:ui'] },
  async ({ app, agent, screen, browser }) => {
    await app.open('/ar/login');
    await agent.act('sign in as {email} with password {pw}', { params: LOGIN });

    await app.open('/ar/sales/customers/new');

    // Verify RTL direction on Arabic locale
    expect(await browser.evaluate(() => document.documentElement.dir)).toBe('rtl');

    // Capture RTL screenshot for visual verification
    await screen.page().screenshot({ path: 'test-results/492-customer-form-ar-rtl-create.png', fullPage: true });

    // Check the submit button has correct Arabic text and aria-label for create mode
    const submitButton = screen.getByRole('button', { name: CREATE_CUSTOMER_LABEL_AR });
    await expect(submitButton).toBeVisible();
    await expect(submitButton).toHaveAttribute('type', 'submit');
    await expect(submitButton).toHaveAttribute('aria-label', CREATE_CUSTOMER_LABEL_AR);
  },
);

test(
  '@issue-492 AC4: customer form submit button shows correct Arabic labels in RTL update mode',
  { tags: ['feat:mz-customers', 'lvl:ui'] },
  async ({ app, agent, screen, browser }) => {
    await app.open('/ar/login');
    await agent.act('sign in as {email} with password {pw}', { params: LOGIN });

    // First create a customer to edit
    await app.open('/ar/sales/customers/new');
    await agent.act('fill customer name with {name}', { params: { name: `${SEED}-test-customer-ar` } });
    await agent.act('click the create customer button');
    await agent.assert('the customer was created');

    // Navigate to edit the customer
    await app.open('/ar/sales/customers');
    await agent.act('click the edit button for the customer named {name}', { params: { name: `${SEED}-test-customer-ar` } });

    // Verify RTL direction
    expect(await browser.evaluate(() => document.documentElement.dir)).toBe('rtl');

    // Capture RTL screenshot for visual verification
    await screen.page().screenshot({ path: 'test-results/492-customer-form-ar-rtl-update.png', fullPage: true });

    // Check the submit button has correct Arabic text and aria-label for update mode
    const submitButton = screen.getByRole('button', { name: UPDATE_CUSTOMER_LABEL_AR });
    await expect(submitButton).toBeVisible();
    await expect(submitButton).toHaveAttribute('type', 'submit');
    await expect(submitButton).toHaveAttribute('aria-label', UPDATE_CUSTOMER_LABEL_AR);
  },
);

test(
  '@issue-492 AC5: customer form submit button shows correct English labels in LTR for comparison',
  { tags: ['feat:mz-customers', 'lvl:ui'] },
  async ({ app, agent, screen, browser }) => {
    await app.open('/en/login');
    await agent.act('sign in as {email} with password {pw}', { params: LOGIN });

    await app.open('/en/sales/customers/new');

    // Verify LTR direction on English locale
    expect(await browser.evaluate(() => document.documentElement.dir)).toBe('ltr');

    // Capture LTR screenshot for visual comparison
    await screen.page().screenshot({ path: 'test-results/492-customer-form-en-ltr-create.png', fullPage: true });

    // Check the submit button has correct English text and aria-label for create mode
    const submitButton = screen.getByRole('button', { name: /create customer/i });
    await expect(submitButton).toBeVisible();
    await expect(submitButton).toHaveAttribute('type', 'submit');
    await expect(submitButton).toHaveAttribute('aria-label', 'Create Customer');
  },
);