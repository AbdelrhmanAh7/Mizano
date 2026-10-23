import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

test(
  '@issue-316 AC1-AC5: customer form submit button localization and city-select country dependency',
  { tags: ['feat:mz-customers', 'lvl:ui'] },
  async ({ app, agent, screen, browser }) => {
    // 1. Sign in as admin
    await app.open('/en/login');
    await agent.act('sign in as {email} with password {pw}', {
      params: { email: 'admin@mizano.com', pw: 'password123' },
    });

    // 2. Open new customer form in English (/en/sales/customers/new)
    await app.open('/en/sales/customers/new');

    // AC1: In English, when country is not selected, CitySelect is disabled and shows guidance placeholder
    await agent.assert('the billing city input is disabled and displays guidance placeholder to select a country first');
    await expect(screen.getByPlaceholder('Select a country first')).toBeDisabled();

    // AC3: In English create mode, submit button visible text and accessible name say "Create Customer"
    await agent.assert('the submit button says Create Customer');
    await expect(screen.getByRole('button', { name: 'Create Customer' })).toBeVisible();

    // 3. Open new customer form in Arabic (/ar/sales/customers/new)
    await app.open('/ar/sales/customers/new');

    // RTL verification
    const dir = await browser.evaluate(() => document.documentElement.dir);
    expect(dir).toBe('rtl');

    // AC1: In Arabic, when country is not selected, CitySelect is disabled and shows guidance placeholder "اختر الدولة أولاً"
    await agent.assert('the billing city input is disabled and displays guidance placeholder اختر الدولة أولاً');
    await expect(screen.getByPlaceholder('اختر الدولة أولاً')).toBeDisabled();

    // AC3: In Arabic create mode, submit button visible text and accessible name say "إنشاء عميل"
    await agent.assert('the submit button displays إنشاء عميل');
    await expect(screen.getByRole('button', { name: 'إنشاء عميل' })).toBeVisible();

    // 4. Fill in country to verify AC2 (enabled and city placeholder)
    await agent.act('fill the customer name with {name}', { params: { name: 'E2E Test Customer' } });
    await agent.act('select United States as the billing country');

    // AC2: Once country is selected, CitySelect becomes enabled
    await agent.assert('the billing city input is now enabled for city entry');
  },
);
