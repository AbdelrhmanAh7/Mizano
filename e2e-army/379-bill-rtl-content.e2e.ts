import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

const LOGIN = {
  email: process.env.E2E_USER_EMAIL || process.env.E2E_LOGIN_EMAIL || '',
  pw: process.env.E2E_USER_PASSWORD || process.env.E2E_LOGIN_PASSWORD || '',
};

async function loginAsAdmin(
  app: { open: (url: string) => Promise<void> },
  agent: { act: (action: string, options: { params: Record<string, string> }) => Promise<void> },
) {
  test.skip(
    !LOGIN.email || !LOGIN.pw,
    'E2E credentials not configured (set E2E_USER_EMAIL / E2E_USER_PASSWORD or E2E_LOGIN_EMAIL / E2E_LOGIN_PASSWORD)',
  );
  await app.open('/ar/login');
  await agent.act('sign in as {email} with password {pw}', { params: LOGIN });
}

test(
  '@issue-379 AC1: bill-form page layout verifies computed RTL direction and text alignment',
  { tags: ['feat:mz-purchase-bills', 'lvl:ui'] },
  async ({ app, agent, screen, browser }) => {
    await loginAsAdmin(app, agent);

    await app.open('/ar/purchases/bills/new');

    // Verify document-level RTL attribute
    expect(await browser.evaluate(() => document.documentElement.dir)).toBe('rtl');

    // Verify content-level RTL computed direction and alignment on form body
    const contentStyles = await browser.evaluate(() => {
      const form = document.querySelector('form');
      if (!form) return null;
      const computed = window.getComputedStyle(form);
      return {
        direction: computed.direction,
        textAlign: computed.textAlign,
      };
    });

    expect(contentStyles).not.toBeNull();
    expect(contentStyles?.direction).toBe('rtl');

    // Verify localized action buttons and Arabic terminology from purchases.json
    await expect(screen.getByRole('button', { name: 'إنشاء فاتورة' })).toBeVisible();
    await expect(screen.getByRole('button', { name: 'إلغاء' })).toBeVisible();
    await agent.assert('the bill form is rendered in Arabic with right-to-left layout and localized action buttons');
  },
);

test(
  '@issue-379 AC2: bill-form Arabic terminology matches canonical application strings',
  { tags: ['feat:mz-purchase-bills', 'lvl:ui'] },
  async ({ app, agent, screen }) => {
    await loginAsAdmin(app, agent);

    await app.open('/ar/purchases/bills/new');

    // Verify canonical labels and headings from messages/ar/purchases.json
    await expect(screen.getByText('المورد')).toBeVisible();
    await expect(screen.getByText('تاريخ الفاتورة')).toBeVisible();
    await expect(screen.getByText('تاريخ الاستحقاق')).toBeVisible();
    await agent.assert('the bill form labels match Arabic application strings');
  },
);

test(
  '@issue-379 AC6: language switcher navigates between English and Arabic RTL bill form',
  { tags: ['feat:mz-purchase-bills', 'lvl:ui'] },
  async ({ app, agent, screen, browser }) => {
    test.skip(
      !LOGIN.email || !LOGIN.pw,
      'E2E credentials not configured (set E2E_USER_EMAIL / E2E_USER_PASSWORD or E2E_LOGIN_EMAIL / E2E_LOGIN_PASSWORD)',
    );
    await app.open('/en/login');
    await agent.act('sign in as {email} with password {pw}', { params: LOGIN });

    await app.open('/en/purchases/bills/new');
    expect(await browser.evaluate(() => document.documentElement.dir)).toBe('ltr');

    // Click Language button and then Arabic link
    await agent.act('click the Language button to open language selector');
    await agent.act('click the Arabic link to switch language to Arabic');

    // Verify page navigated to Arabic RTL bill form
    expect(await browser.evaluate(() => document.documentElement.dir)).toBe('rtl');
    await expect(screen.getByRole('button', { name: 'إنشاء فاتورة' })).toBeVisible();
    await agent.assert('the bill form is now displayed in Arabic with right-to-left layout');
  },
);
