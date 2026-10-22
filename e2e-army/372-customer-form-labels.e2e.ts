import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

test(
  '@issue-372 AC1 AC2 AC3 AC4: customer form renders localized accessible labels in English and Arabic without mistranslated fragments',
  { tags: ['feat:mz-customers', 'lvl:ui'] },
  async ({ app, agent, screen, browser }) => {
    // 1. Sign in through the login form
    await app.open('/en/login');
    await agent.act('sign in as {email} with password {pw}', {
      params: { email: 'admin@mizano.com', pw: 'password123' },
    });

    const badArabicFragments = [
      'مشاركة الشارع',
      'مشاركة الدولة',
      'مشاركة المدينة',
      'مشاركة البريد',
      'مشاركة',
    ];

    // 2. Open customer create form in Arabic (/ar/sales/customers/new)
    await app.open('/ar/sales/customers/new');

    // Arabic locale check: document direction must be RTL
    const arDir = await browser.evaluate(() => document.documentElement.dir);
    expect(arDir).toBe('rtl');

    // Deterministic DOM checks for specific billing address input aria-labels in Arabic
    const arFieldAriaLabels = await browser.evaluate(() => {
      const getAria = (id: string) => document.getElementById(id)?.getAttribute('aria-label') || '';
      return {
        billingStreet: getAria('billingStreet'),
        billingCountry: getAria('billingCountry'),
        billingCity: getAria('billingCity'),
        billingState: getAria('billingState'),
        billingPostalCode: getAria('billingPostalCode'),
        shippingStreet: getAria('shippingStreet'),
        shippingCountry: getAria('shippingCountry'),
        shippingCity: getAria('shippingCity'),
        shippingState: getAria('shippingState'),
        shippingPostalCode: getAria('shippingPostalCode'),
      };
    });

    expect(arFieldAriaLabels.billingStreet).toBe('شارع الفوترة');
    expect(arFieldAriaLabels.billingCountry).toBe('دولة الفوترة');
    expect(arFieldAriaLabels.billingCity).toBe('مدينة الفوترة');
    expect(arFieldAriaLabels.billingPostalCode).toBe('الرمز البريدي لعنوان الفوترة');

    // Deterministic DOM checks for specific shipping address input aria-labels in Arabic
    expect(arFieldAriaLabels.shippingStreet).toBe('شارع الشحن');
    expect(arFieldAriaLabels.shippingCountry).toBe('دولة الشحن');
    expect(arFieldAriaLabels.shippingCity).toBe('مدينة الشحن');
    expect(arFieldAriaLabels.shippingPostalCode).toBe('الرمز البريدي لعنوان الشحن');

    // Deterministic locator assertions for accessible names
    await expect(screen.getByLabel('شارع الفوترة')).toBeVisible();
    await expect(screen.getByLabel('دولة الفوترة')).toBeVisible();
    await expect(screen.getByLabel('مدينة الفوترة')).toBeVisible();
    await expect(screen.getByLabel('الرمز البريدي لعنوان الفوترة')).toBeVisible();
    await expect(screen.getByLabel('شارع الشحن')).toBeVisible();
    await expect(screen.getByLabel('دولة الشحن')).toBeVisible();
    await expect(screen.getByLabel('مدينة الشحن')).toBeVisible();
    await expect(screen.getByLabel('الرمز البريدي لعنوان الشحن')).toBeVisible();

    // Collect all aria-labels on the Arabic page and verify:
    // (a) array is not empty (prevents vacuous pass)
    // (b) none contain forbidden mistranslations ("مشاركة", "مشاركة الشارع", etc.) or slash stacking
    // (c) expected labels are present
    const arAriaLabels = await browser.evaluate(() => {
      const elements = Array.from(document.querySelectorAll('[aria-label]'));
      return elements.map((el) => el.getAttribute('aria-label') || '').filter(Boolean);
    });

    expect(arAriaLabels.length).toBeGreaterThanOrEqual(10);
    for (const label of arAriaLabels) {
      for (const bad of badArabicFragments) {
        expect(label).not.toContain(bad);
      }
      expect(label).not.toContain(' / ');
    }

    expect(arAriaLabels).toContain('شارع الفوترة');
    expect(arAriaLabels).toContain('دولة الفوترة');
    expect(arAriaLabels).toContain('مدينة الفوترة');
    expect(arAriaLabels).toContain('الرمز البريدي لعنوان الفوترة');
    expect(arAriaLabels).toContain('شارع الشحن');
    expect(arAriaLabels).toContain('دولة الشحن');
    expect(arAriaLabels).toContain('مدينة الشحن');
    expect(arAriaLabels).toContain('الرمز البريدي لعنوان الشحن');

    // 3. Open customer create form in English (/en/sales/customers/new)
    await app.open('/en/sales/customers/new');

    // English locale check: document direction must be LTR
    const enDir = await browser.evaluate(() => document.documentElement.dir);
    expect(enDir).toBe('ltr');

    // Deterministic DOM checks for specific input aria-labels in English
    const enFieldAriaLabels = await browser.evaluate(() => {
      const getAria = (id: string) => document.getElementById(id)?.getAttribute('aria-label') || '';
      return {
        billingStreet: getAria('billingStreet'),
        billingCountry: getAria('billingCountry'),
        billingCity: getAria('billingCity'),
        billingState: getAria('billingState'),
        billingPostalCode: getAria('billingPostalCode'),
        shippingStreet: getAria('shippingStreet'),
        shippingCountry: getAria('shippingCountry'),
        shippingCity: getAria('shippingCity'),
        shippingState: getAria('shippingState'),
        shippingPostalCode: getAria('shippingPostalCode'),
      };
    });

    expect(enFieldAriaLabels.billingStreet).toBe('Billing Street');
    expect(enFieldAriaLabels.billingCountry).toBe('Billing Country');
    expect(enFieldAriaLabels.billingCity).toBe('Billing City');
    expect(enFieldAriaLabels.billingPostalCode).toBe('Billing Postal Code');
    expect(enFieldAriaLabels.shippingStreet).toBe('Shipping Street');
    expect(enFieldAriaLabels.shippingCountry).toBe('Shipping Country');
    expect(enFieldAriaLabels.shippingCity).toBe('Shipping City');
    expect(enFieldAriaLabels.shippingPostalCode).toBe('Shipping Postal Code');

    // Deterministic locator assertions for accessible names in English
    await expect(screen.getByLabel('Billing Street')).toBeVisible();
    await expect(screen.getByLabel('Billing Country')).toBeVisible();
    await expect(screen.getByLabel('Billing City')).toBeVisible();
    await expect(screen.getByLabel('Billing Postal Code')).toBeVisible();
    await expect(screen.getByLabel('Shipping Street')).toBeVisible();
    await expect(screen.getByLabel('Shipping Country')).toBeVisible();
    await expect(screen.getByLabel('Shipping City')).toBeVisible();
    await expect(screen.getByLabel('Shipping Postal Code')).toBeVisible();

    // Check all aria-labels in English
    const enAriaLabels = await browser.evaluate(() => {
      const elements = Array.from(document.querySelectorAll('[aria-label]'));
      return elements.map((el) => el.getAttribute('aria-label') || '').filter(Boolean);
    });

    expect(enAriaLabels.length).toBeGreaterThanOrEqual(10);
    for (const label of enAriaLabels) {
      for (const bad of badArabicFragments) {
        expect(label).not.toContain(bad);
      }
      expect(label).not.toContain(' / ');
    }

    expect(enAriaLabels).toContain('Billing Street');
    expect(enAriaLabels).toContain('Billing Country');
    expect(enAriaLabels).toContain('Billing City');
    expect(enAriaLabels).toContain('Billing Postal Code');
    expect(enAriaLabels).toContain('Shipping Street');
    expect(enAriaLabels).toContain('Shipping Country');
    expect(enAriaLabels).toContain('Shipping City');
    expect(enAriaLabels).toContain('Shipping Postal Code');
  },
);
