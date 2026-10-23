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

const REFERENCE_LABEL_AR: string = arPurchases.bills?.form?.reference;
if (!REFERENCE_LABEL_AR) {
  throw new Error("Missing required translation key 'bills.form.reference' in ar/purchases.json");
}

const CURRENCY_LABEL_AR: string = arPurchases.bills?.form?.currency;
if (!CURRENCY_LABEL_AR) {
  throw new Error("Missing required translation key 'bills.form.currency' in ar/purchases.json");
}

const LINE_ITEMS_TITLE_AR: string = arPurchases.bills?.form?.lineItems;
if (!LINE_ITEMS_TITLE_AR) {
  throw new Error("Missing required translation key 'bills.form.lineItems' in ar/purchases.json");
}

const NOTES_LABEL_AR: string = arPurchases.bills?.form?.notes;
if (!NOTES_LABEL_AR) {
  throw new Error("Missing required translation key 'bills.form.notes' in ar/purchases.json");
}

const SUBTOTAL_AR: string = arPurchases.bills?.form?.subtotal;
if (!SUBTOTAL_AR) {
  throw new Error("Missing required translation key 'bills.form.subtotal' in ar/purchases.json");
}

const TAX_AR: string = arPurchases.bills?.form?.tax;
if (!TAX_AR) {
  throw new Error("Missing required translation key 'bills.form.tax' in ar/purchases.json");
}

const TOTAL_AR: string = arPurchases.bills?.form?.total;
if (!TOTAL_AR) {
  throw new Error("Missing required translation key 'bills.form.total' in ar/purchases.json");
}

const ADD_LINE_AR: string = arPurchases.bills?.form?.addLine;
if (!ADD_LINE_AR) {
  throw new Error("Missing required translation key 'bills.form.addLine' in ar/purchases.json");
}

const CANCEL_AR: string = arPurchases.bills?.form?.cancel;
if (!CANCEL_AR) {
  throw new Error("Missing required translation key 'bills.form.cancel' in ar/purchases.json");
}

const CREATE_BILL_AR: string = arPurchases.bills?.form?.createBill;
if (!CREATE_BILL_AR) {
  throw new Error("Missing required translation key 'bills.form.createBill' in ar/purchases.json");
}

// Line items table column headers
const ITEM_COLUMN_AR: string = arPurchases.lineItems?.item;
if (!ITEM_COLUMN_AR) {
  throw new Error("Missing required translation key 'lineItems.item' in ar/purchases.json");
}

const ACCOUNT_COLUMN_AR: string = arPurchases.lineItems?.account;
if (!ACCOUNT_COLUMN_AR) {
  throw new Error("Missing required translation key 'lineItems.account' in ar/purchases.json");
}

const DESCRIPTION_COLUMN_AR: string = arPurchases.lineItems?.description;
if (!DESCRIPTION_COLUMN_AR) {
  throw new Error("Missing required translation key 'lineItems.description' in ar/purchases.json");
}

const QTY_COLUMN_AR: string = arPurchases.lineItems?.quantity;
if (!QTY_COLUMN_AR) {
  throw new Error("Missing required translation key 'lineItems.quantity' in ar/purchases.json");
}

const RATE_COLUMN_AR: string = arPurchases.lineItems?.rate;
if (!RATE_COLUMN_AR) {
  throw new Error("Missing required translation key 'lineItems.rate' in ar/purchases.json");
}

const AMOUNT_COLUMN_AR: string = arPurchases.lineItems?.amount;
if (!AMOUNT_COLUMN_AR) {
  throw new Error("Missing required translation key 'lineItems.amount' in ar/purchases.json");
}

const TAX_RATE_COLUMN_AR: string = arPurchases.lineItems?.tax;
if (!TAX_RATE_COLUMN_AR) {
  throw new Error("Missing required translation key 'lineItems.tax' in ar/purchases.json");
}

const TOTAL_COLUMN_AR: string = arPurchases.lineItems?.amount; // Reuse amount for total column
if (!TOTAL_COLUMN_AR) {
  throw new Error("Missing required translation key 'lineItems.amount' in ar/purchases.json");
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

async function loginAndOpenBillForm(
  app: { open: (url: string) => Promise<void> },
  agent: { act: (action: string, options: { params: Record<string, string> }) => Promise<void> },
  locale: 'ar' | 'en',
) {
  const creds = getLoginCredentials();
  await app.open(`/${locale}/login`);
  await agent.act('sign in as {email} with password {pw}', { params: creds });
  await app.open(`/${locale}/purchases/bills/new`);
}

test(
  '@issue-416 AC1: bill-form page layout verifies computed RTL direction and text alignment',
  { tags: ['feat:mz-purchase-bills', 'lvl:ui'] },
  async ({ app, agent, screen, browser }) => {
    await loginAndOpenBillForm(app, agent, 'ar');

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
    const firstInput = billForm.locator('input, select, textarea').first();
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

    // Also verify label RTL properties
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

    await agent.assert('the bill form content is displayed in Arabic with verified right-to-left layout and text alignment');
  },
);

test(
  '@issue-416 AC2: bill-form Arabic terminology matches canonical application catalog strings',
  { tags: ['feat:mz-purchase-bills', 'lvl:ui'] },
  async ({ app, agent, screen }) => {
    await loginAndOpenBillForm(app, agent, 'ar');

    // Verify page title matches canonical catalog string
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

    // Verify due date label matches canonical catalog string
    const dueDateLabel = screen.getByText(DUE_DATE_LABEL_AR).first();
    await expect(dueDateLabel, 'due date label must be visible').toBeVisible();
    const renderedDueDate = ((await dueDateLabel.textContent()) ?? '').normalize('NFC').trim();
    expect(
      renderedDueDate.replace(/\s*\*$/, '').trim(),
      'due date label must match ar catalog bills.form.dueDate',
    ).toBe(DUE_DATE_LABEL_AR.normalize('NFC').trim());

    // Verify reference label matches canonical catalog string
    const referenceLabel = screen.getByText(REFERENCE_LABEL_AR).first();
    await expect(referenceLabel, 'reference label must be visible').toBeVisible();
    const renderedReference = ((await referenceLabel.textContent()) ?? '').normalize('NFC').trim();
    expect(
      renderedReference.replace(/\s*\*$/, '').trim(),
      'reference label must match ar catalog bills.form.reference',
    ).toBe(REFERENCE_LABEL_AR.normalize('NFC').trim());

    // Verify currency label matches canonical catalog string
    const currencyLabel = screen.getByText(CURRENCY_LABEL_AR).first();
    await expect(currencyLabel, 'currency label must be visible').toBeVisible();
    const renderedCurrency = ((await currencyLabel.textContent()) ?? '').normalize('NFC').trim();
    expect(
      renderedCurrency.replace(/\s*\*$/, '').trim(),
      'currency label must match ar catalog bills.form.currency',
    ).toBe(CURRENCY_LABEL_AR.normalize('NFC').trim());

    // Verify line items title matches canonical catalog string
    const lineItemsTitle = screen.getByText(LINE_ITEMS_TITLE_AR).first();
    await expect(lineItemsTitle, 'line items title must be visible').toBeVisible();
    const renderedLineItemsTitle = ((await lineItemsTitle.textContent()) ?? '').normalize('NFC').trim();
    expect(
      renderedLineItemsTitle,
      'line items title must match ar catalog bills.form.lineItems',
    ).toBe(LINE_ITEMS_TITLE_AR.normalize('NFC').trim());

    // Verify notes label matches canonical catalog string
    const notesLabel = screen.getByText(NOTES_LABEL_AR).first();
    await expect(notesLabel, 'notes label must be visible').toBeVisible();
    const renderedNotes = ((await notesLabel.textContent()) ?? '').normalize('NFC').trim();
    expect(
      renderedNotes,
      'notes label must match ar catalog bills.form.notes',
    ).toBe(NOTES_LABEL_AR.normalize('NFC').trim());

    // Verify line items table column headers from purchases.lineItems catalog
    const columnHeaders = [
      ITEM_COLUMN_AR,
      DESCRIPTION_COLUMN_AR,
      QTY_COLUMN_AR,
      RATE_COLUMN_AR,
      AMOUNT_COLUMN_AR,
      TAX_RATE_COLUMN_AR,
      TOTAL_COLUMN_AR,
    ];

    for (const header of columnHeaders) {
      const element = screen.getByText(header, { exact: false }).first();
      await expect(element, `Arabic column header "${header}" should be visible`).toBeVisible();
      const renderedHeader = ((await element.textContent()) ?? '').normalize('NFC').trim();
      expect(
        renderedHeader,
        `column header "${header}" must match canonical lineItems string`,
      ).toBe(header.normalize('NFC').trim());
    }

    // Specifically verify the account column header matches canonical 'الحساب' (not expense form's 'حساب المصروفات')
    const accountHeader = screen.getByText(ACCOUNT_COLUMN_AR, { exact: false }).first();
    await expect(accountHeader, 'account column header must match lineItems.account catalog').toBeVisible();
    const renderedAccountHeader = (await accountHeader.textContent()) ?? '';
    expect(
      renderedAccountHeader.normalize('NFC').trim(),
      'account column header must match canonical lineItems.account string',
    ).toBe(ACCOUNT_COLUMN_AR.normalize('NFC').trim());

    await agent.assert('the bill form labels and headers match canonical Arabic application strings from purchases.bills.form and purchases.lineItems');
  },
);

test(
  '@issue-416 AC3: bill-form verifies RTL logical properties, spacing alignment, and dropdown listbox direction',
  { tags: ['feat:mz-purchase-bills', 'lvl:ui'] },
  async ({ app, agent, screen }) => {
    await loginAndOpenBillForm(app, agent, 'ar');

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

    // Geometric right-alignment measurement: account header must sit closer to the container right edge in RTL
    const accountHeader = screen.getByText(ACCOUNT_COLUMN_AR, { exact: false }).first();
    await expect(accountHeader, 'account column header must be visible').toBeVisible();

    const formBox = await billForm.boundingBox();
    const headerBox = await accountHeader.boundingBox();
    expect(formBox, 'bill form bounding box must be available').not.toBeNull();
    expect(headerBox, 'account column header bounding box must be available').not.toBeNull();

    if (formBox && headerBox) {
      const rightGap = formBox.x + formBox.width - (headerBox.x + headerBox.width);
      const leftGap = headerBox.x - formBox.x;
      expect(
        rightGap,
        'account column header must be positioned closer to the right container edge (right gap < left gap)',
      ).toBeLessThan(leftGap);
    }

    // Unconditionally locate and open a select dropdown (combobox) to verify listbox computes direction rtl
    const comboboxTrigger = billForm.getByRole('combobox').first();
    await expect(comboboxTrigger, 'select dropdown trigger must be visible').toBeVisible();
    await comboboxTrigger.click();

    // Verify open listbox renders with computed RTL direction unconditionally (no silent if-skip)
    const listbox = screen.page().getByRole('listbox').first();
    await expect(listbox, 'select listbox must be visible when opened').toBeVisible();
    await expect(listbox, 'select listbox must compute direction rtl').toHaveCSS('direction', 'rtl');

    // Verify Add Line button visibility (localized text)
    await expect(screen.getByRole('button', { name: ADD_LINE_AR })).toBeVisible();

    // Verify form action buttons compute direction rtl
    const createButton = screen.getByRole('button', { name: CREATE_BILL_AR });
    await expect(createButton, 'create bill button must be visible').toBeVisible();
    await expect(createButton, 'create bill button must compute direction rtl').toHaveCSS('direction', 'rtl');

    // Capture RTL screenshot with listbox open
    await screen.page().screenshot({ path: 'test-results/416-bill-form-ar-rtl-listbox.png', fullPage: true });

    await agent.assert('the bill form controls, listbox, and geometry display verified RTL direction and alignment');
  },
);

test(
  '@issue-416 AC4: bill-form renders LTR in English locale for visual comparison',
  { tags: ['feat:mz-purchase-bills', 'lvl:ui'] },
  async ({ app, agent, screen, browser }) => {
    await loginAndOpenBillForm(app, agent, 'en');

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