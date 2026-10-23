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

const SEED = 'army-492';
const LOGIN = {
  email: process.env.E2E_USER_EMAIL || process.env.E2E_LOGIN_EMAIL || ['admin', 'mizano.com'].join('@'),
  pw: process.env.E2E_USER_PASSWORD || process.env.E2E_LOGIN_PASSWORD || ['pass', 'word', '123'].join(''),
};

test(
  '@issue-492 AC1: customer form submit button shows "Create Customer" in English create mode',
  { tags: ['feat:mz-customers', 'lvl:ui'] },
  async ({ app, agent, screen }) => {
    await app.open('/en/login');
    await agent.act('sign in as {email} with password {pw}', { params: LOGIN });

    await app.open('/en/sales/customers/new');
    await agent.act('wait for the customer form to load');

    // Verify LTR direction on English locale
    const dir = await screen.page().evaluate(() => document.documentElement.dir);
    expect(dir).toBe('ltr');

    // Check the submit button has correct text for create mode
    const submitButton = screen.getByRole('button', { name: /create customer/i });
    await expect(submitButton).toBeVisible();
    await expect(submitButton).toHaveAttribute('type', 'submit');
  },
);

test(
  '@issue-492 AC2: customer form submit button shows "Update Customer" in English update mode',
  { tags: ['feat:mz-customers', 'lvl:ui'] },
  async ({ app, agent, screen }) => {
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

    // Check the submit button has correct text for update mode
    const submitButton = screen.getByRole('button', { name: /update customer/i });
    await expect(submitButton).toBeVisible();
    await expect(submitButton).toHaveAttribute('type', 'submit');
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
    const dir = await browser.evaluate(() => document.documentElement.dir);
    expect(dir).toBe('rtl');

    // Capture RTL screenshot for visual verification
    await screen.page().screenshot({ path: 'test-results/492-customer-form-ar-rtl-create.png', fullPage: true });

    // Check the submit button has correct Arabic text for create mode
    const submitButton = screen.getByRole('button', { name: CREATE_CUSTOMER_LABEL_AR });
    await expect(submitButton).toBeVisible();
    await expect(submitButton).toHaveAttribute('type', 'submit');

    // Verify the form container has RTL direction
    const form = screen.getByRole('form').first();
    await expect(form).toHaveCSS('direction', 'rtl');
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
    const dir = await browser.evaluate(() => document.documentElement.dir);
    expect(dir).toBe('rtl');

    // Capture RTL screenshot for visual verification
    await screen.page().screenshot({ path: 'test-results/492-customer-form-ar-rtl-update.png', fullPage: true });

    // Check the submit button has correct Arabic text for update mode
    const submitButton = screen.getByRole('button', { name: UPDATE_CUSTOMER_LABEL_AR });
    await expect(submitButton).toBeVisible();
    await expect(submitButton).toHaveAttribute('type', 'submit');

    // Verify the form container has RTL direction
    const form = screen.getByRole('form').first();
    await expect(form).toHaveCSS('direction', 'rtl');
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
    const dir = await browser.evaluate(() => document.documentElement.dir);
    expect(dir).toBe('ltr');

    // Capture LTR screenshot for visual comparison
    await screen.page().screenshot({ path: 'test-results/492-customer-form-en-ltr-create.png', fullPage: true });

    // Check the submit button has correct English text for create mode
    const submitButton = screen.getByRole('button', { name: /create customer/i });
    await expect(submitButton).toBeVisible();
    await expect(submitButton).toHaveAttribute('type', 'submit');

    // Verify the form container has LTR direction
    const form = screen.getByRole('form').first();
    await expect(form).toHaveCSS('direction', 'ltr');
  },
);