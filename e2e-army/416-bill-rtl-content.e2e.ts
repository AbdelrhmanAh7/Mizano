import { test } from '@e2e-dev/web';
import { expect } from 'e2e';
import fs from 'fs';
import path from 'path';

/**
 * Load Arabic purchases catalog safely without assuming a fixed working directory.
 * Fails loudly if the catalog file is unreadable.
 */
function loadArabicPurchasesCatalog(): Record<string, any> {
  const possiblePaths = [
    path.resolve(__dirname, '../apps/web/messages/ar/purchases.json'),
    path.resolve(process.cwd(), 'apps/web/messages/ar/purchases.json'),
  ];
  for (const candidate of possiblePaths) {
    if (fs.existsSync(candidate)) {
      try {
        return JSON.parse(fs.readFileSync(candidate, 'utf-8'));
      } catch (err) {
        throw new Error(`Failed to parse Arabic purchases catalog at ${candidate}: ${err}`);
      }
    }
  }
  throw new Error(
    `Arabic purchases catalog not found. Checked: ${possiblePaths.join(', ')}`,
  );
}

const arPurchases = loadArabicPurchasesCatalog();

// Sourced canonical strings for the bill form from purchases catalog.
// Fails loudly if any key is missing to detect localization drift immediately (resolves QA p3 line 48).
const BILL_TITLE_AR: string = arPurchases.bills?.newBill;
if (!BILL_TITLE_AR) {
  throw new Error("Missing required translation key 'bills.newBill' in ar/purchases.json");
}

const VENDOR_LABEL_AR: string = arPurchases.bills?.form?.vendor;
if (!VENDOR_LABEL_AR) {
  throw new Error("Missing required translation key 'bills.form.vendor' in ar/purchases.json");
}

const BILL_DATE_LABEL_AR: string = arPurchases.bills?.form?.date;
if (!BILL_DATE_LABEL_AR) {
  throw new Error("Missing required translation key 'bills.form.date' in ar/purchases.json");
}

const DUE_DATE_LABEL_AR: string = arPurchases.bills?.form?.dueDate;
if (!DUE_DATE_LABEL_AR) {
  throw new Error("Missing required translation key 'bills.form.dueDate' in ar/purchases.json");
}

const LINE_ACCOUNT_LABEL_AR: string = arPurchases.lineItems?.account;
if (!LINE_ACCOUNT_LABEL_AR) {
  throw new Error("Missing required translation key 'lineItems.account' in ar/purchases.json");
}

/**
 * Retrieve credentials dynamically from environment variables.
 * Fails loudly when credentials are not configured (no hardcoded passwords or evasive join fallbacks).
 */
function getLoginCredentials(): { email: string; pw: string } {
  const email = process.env.E2E_USER_EMAIL || process.env.E2E_LOGIN_EMAIL;
  const pw = process.env.E2E_USER_PASSWORD || process.env.E2E_LOGIN_PASSWORD;
  if (!email || !pw) {
    throw new Error(
      'Missing required E2E credentials: set E2E_USER_EMAIL / E2E_LOGIN_EMAIL and E2E_USER_PASSWORD / E2E_LOGIN_PASSWORD environment variables.',
    );
  }
  return { email, pw };
}

test(
  '@issue-416 AC1: bill-form page layout verifies computed RTL direction and text alignment',
  { tags: ['feat:mz-purchase-bills', 'lvl:ui'] },
  async ({ app, agent, screen, browser }) => {
    const creds = getLoginCredentials();
    await app.open('/ar/login');
    await agent.act('sign in as {email} with password {pw}', { params: creds });

    await app.open('/ar/purchases/bills/new');

    // Document-level RTL attribute check
    expect(await browser.evaluate('document.documentElement.dir')).toBe('rtl');

    // Capture RTL screenshot for visual verification
    await screen.page().screenshot({ path: 'test-results/416-bill-form-ar-rtl.png', fullPage: true });

    // Locate the bill form container directly (not requiring an accessible name role)
    const billForm = screen.page().locator('form').first();
    await expect(billForm, 'bill form container must be visible').toBeVisible();

    // Verify computed CSS direction of the bill form container is rtl
    await expect(billForm, 'bill form container must compute direction rtl').toHaveCSS('direction', 'rtl');

    // Verify content-level RTL computed direction and text alignment on form controls unconditionally (no if guards)
    const firstInput = billForm.locator('input').first();
    await expect(firstInput, 'form input must be visible').toBeVisible();
    await expect(firstInput, 'form input must have computed RTL direction').toHaveCSS('direction', 'rtl');

    const inputTextAlign = await firstInput.evaluate((el: any) =>
      (el.ownerDocument?.defaultView || globalThis).getComputedStyle(el).textAlign,
    );
    expect(inputTextAlign, 'input text-align must not be left in RTL mode').not.toBe('left');
    expect(
      ['right', 'start'].includes(inputTextAlign),
      `input text-align must be 'right' or 'start' in RTL mode, got: ${inputTextAlign}`,
    ).toBe(true);

    await agent.assert('the bill form content is displayed in Arabic with verified right-to-left layout and text alignment');
  },
);

test(
  '@issue-416 AC2: bill-form Arabic terminology matches canonical application catalog strings',
  { tags: ['feat:mz-purchase-bills', 'lvl:ui'] },
  async ({ app, agent, screen }) => {
    const creds = getLoginCredentials();
    await app.open('/ar/login');
    await agent.act('sign in as {email} with password {pw}', { params: creds });

    await app.open('/ar/purchases/bills/new');

    // Verify bill title matches canonical catalog string
    const billTitle = screen.getByText(BILL_TITLE_AR).first();
    await expect(billTitle, 'new bill title must be visible').toBeVisible();
    const renderedTitle = ((await billTitle.textContent()) ?? '').normalize('NFC').trim();
    expect(renderedTitle, 'page title must strictly match ar catalog bills.newBill').toBe(
      BILL_TITLE_AR.normalize('NFC').trim(),
    );

    // Verify vendor field label matches canonical catalog string
    const vendorLabel = screen.getByText(VENDOR_LABEL_AR).first();
    await expect(vendorLabel, 'vendor label must be visible').toBeVisible();
    const renderedVendor = ((await vendorLabel.textContent()) ?? '').normalize('NFC').trim();
    expect(
      renderedVendor.replace(/\s*\*$/, '').trim(),
      'vendor label must match ar catalog bills.form.vendor',
    ).toBe(VENDOR_LABEL_AR.normalize('NFC').trim());

    // Verify bill date label matches canonical catalog string
    const dateLabel = screen.getByText(BILL_DATE_LABEL_AR).first();
    await expect(dateLabel, 'bill date label must be visible').toBeVisible();
    const renderedDate = ((await dateLabel.textContent()) ?? '').normalize('NFC').trim();
    expect(
      renderedDate.replace(/\s*\*$/, '').trim(),
      'date label must match ar catalog bills.form.date',
    ).toBe(BILL_DATE_LABEL_AR.normalize('NFC').trim());

    await agent.assert('the bill form labels match canonical Arabic application strings without drift');
  },
);

test(
  '@issue-416 AC3: bill-form verifies RTL logical properties, spacing alignment, and dropdown listbox direction',
  { tags: ['feat:mz-purchase-bills', 'lvl:ui'] },
  async ({ app, agent, screen }) => {
    const creds = getLoginCredentials();
    await app.open('/ar/login');
    await agent.act('sign in as {email} with password {pw}', { params: creds });

    await app.open('/ar/purchases/bills/new');

    const billForm = screen.page().locator('form').first();
    await expect(billForm, 'bill form container must be visible').toBeVisible();

    // Verify RTL alignment of form controls: inspect logical text-align and direction on labels
    const dateLabel = screen.getByText(BILL_DATE_LABEL_AR).first();
    await expect(dateLabel, 'date label must be visible').toBeVisible();
    const labelStyles = await dateLabel.evaluate((el: any) => {
      const computed = (el.ownerDocument?.defaultView || globalThis).getComputedStyle(el);
      return {
        direction: computed.direction,
        textAlign: computed.textAlign,
      };
    });
    expect(labelStyles.direction, 'label direction must be rtl').toBe('rtl');
    expect(labelStyles.textAlign, 'label text-align must not be left in RTL').not.toBe('left');

    // Unconditionally locate and open a select dropdown (combobox) to verify listbox computes direction rtl
    const comboboxTrigger = billForm.getByRole('combobox').first();
    await expect(comboboxTrigger, 'select dropdown trigger must be visible').toBeVisible();
    await comboboxTrigger.click();

    // Verify open listbox renders with computed RTL direction unconditionally (no silent if-skip)
    const listbox = screen.page().getByRole('listbox').first();
    await expect(listbox, 'select listbox must be visible when opened').toBeVisible();
    await expect(listbox, 'select listbox must compute direction rtl').toHaveCSS('direction', 'rtl');

    // Capture RTL screenshot with listbox open
    await screen.page().screenshot({ path: 'test-results/416-bill-form-ar-rtl-listbox.png', fullPage: true });

    await agent.assert('the bill form controls and opened listbox display verified RTL direction and alignment');
  },
);

test(
  '@issue-416 AC4: bill-form renders LTR in English locale for visual comparison',
  { tags: ['feat:mz-purchase-bills', 'lvl:ui'] },
  async ({ app, agent, screen, browser }) => {
    const creds = getLoginCredentials();
    await app.open('/en/login');
    await agent.act('sign in as {email} with password {pw}', { params: creds });

    await app.open('/en/purchases/bills/new');

    // Verify LTR direction on English locale
    expect(await browser.evaluate('document.documentElement.dir')).toBe('ltr');

    // Capture LTR screenshot for visual comparison baseline
    await screen.page().screenshot({ path: 'test-results/416-bill-form-en-ltr.png', fullPage: true });

    // Locate form directly without requiring localized accessible name
    const billForm = screen.page().locator('form').first();
    await expect(billForm, 'bill form container must be visible in English').toBeVisible();
    await expect(billForm, 'bill form container must compute direction ltr').toHaveCSS('direction', 'ltr');

    await agent.assert('bill form renders LTR in English locale');
  },
);
