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

    // 2. Open customer create form in Arabic (/ar/sales/customers/new)
    await app.open('/ar/sales/customers/new');

    // Arabic locale check: document direction must be RTL
    const arDir = await browser.evaluate(() => document.documentElement.dir);
    expect(arDir).toBe('rtl');

    // Assert that the page renders correct MSA Arabic labels for billing and shipping addresses
    await agent.assert(
      'the form displays Arabic billing address labels: شارع الفوترة, دولة الفوترة, مدينة الفوترة, and الرمز البريدي لعنوان الفوترة',
    );
    await agent.assert(
      'the form displays Arabic shipping address labels: شارع الشحن, دولة الشحن, مدينة الشحن, and الرمز البريدي لعنوان الشحن',
    );

    // Assert that mistranslated "مشاركة" fragments are NOT present anywhere in accessible labels or text
    const arPageText = await browser.evaluate(() => document.body.innerText);
    expect(arPageText).not.toContain('مشاركة الشارع');
    expect(arPageText).not.toContain('مشاركة الدولة');
    expect(arPageText).not.toContain('مشاركة المدينة');
    expect(arPageText).not.toContain('مشاركة البريد');

    // Check DOM aria-labels in Arabic
    const arAriaLabels = await browser.evaluate(() => {
      const elements = Array.from(document.querySelectorAll('[aria-label]'));
      return elements.map((el) => el.getAttribute('aria-label') || '');
    });
    for (const label of arAriaLabels) {
      expect(label).not.toContain('مشاركة');
      expect(label).not.toContain(' / ');
    }

    // 3. Open customer create form in English (/en/sales/customers/new)
    await app.open('/en/sales/customers/new');

    // English locale check: document direction must be LTR
    const enDir = await browser.evaluate(() => document.documentElement.dir);
    expect(enDir).toBe('ltr');

    // Assert that the form renders clean English accessible labels
    await agent.assert(
      'the form displays English billing address fields: Billing Street, Billing Country, Billing City, and Zip/Postal Code',
    );
    await agent.assert(
      'the form displays English shipping address fields: Shipping Street, Shipping Country, Shipping City, and Zip/Postal Code',
    );

    // Check DOM aria-labels in English
    const enAriaLabels = await browser.evaluate(() => {
      const elements = Array.from(document.querySelectorAll('[aria-label]'));
      return elements.map((el) => el.getAttribute('aria-label') || '');
    });
    for (const label of enAriaLabels) {
      expect(label).not.toContain('مشاركة');
      expect(label).not.toContain(' / ');
    }
  },
);
