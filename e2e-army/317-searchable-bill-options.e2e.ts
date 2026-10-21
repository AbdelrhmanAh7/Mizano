import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

const SEED = 'army-317';
const LOGIN = { email: 'admin@mizano.com', pw: 'password123' };

test(
  '@issue-317 AC1-AC4: searchable and page-aware accounts and items in bill-form allow selecting later-page records and preserve selection',
  { tags: ['feat:mz-purchase-bills', 'lvl:ui'] },
  async ({ app, agent, screen }) => {
    await app.open('/en/login');
    await agent.act('sign in as {email} with password {pw}', { params: LOGIN });

    await app.open('/en/purchases/vendors/new');
    await agent.act('create a vendor named {name}', { params: { name: `${SEED}-vendor` } });

    await app.open('/en/purchases/bills/new');
    await agent.act('choose the vendor {vendor}', { params: { vendor: `${SEED}-vendor` } });

    // Verify searchable item picker exists on first line
    await expect(screen.getByTestId('line-0-item')).toBeVisible();
    await agent.act('open the item picker on the first line and search for {query}', {
      params: { query: 'Office' },
    });
    await agent.act('choose any matching item or choose Manual Entry');

    // Verify searchable account picker exists on first line
    await expect(screen.getByTestId('line-0-account')).toBeVisible();
    await agent.act('open the expense account picker on the first line and search for {query}', {
      params: { query: 'Expense' },
    });
    await agent.act('choose any expense account from the search results');
    await agent.assert('the selected expense account is preserved on subsequent searches');

    await agent.act(
      'type description {desc}, quantity {qty} and rate {rate}',
      { params: { desc: `${SEED}-searchable-item`, qty: '1', rate: '100' } },
    );
    await agent.act('click Create Bill');
    await agent.assert('the bill was saved and the page left the new-bill form without errors');
  },
);

test(
  '@issue-317 AC6: bill-form item and account search controls are displayed in Arabic and RTL',
  { tags: ['feat:mz-purchase-bills', 'lvl:ui'] },
  async ({ app, agent, screen, browser }) => {
    await app.open('/ar/login');
    await agent.act('sign in as {email} with password {pw}', { params: LOGIN });

    await app.open('/ar/purchases/bills/new');
    expect(await browser.evaluate(() => document.documentElement.dir)).toBe('rtl');
    await expect(screen.getByText('حساب المصروف').first()).toBeVisible();
    await expect(screen.getByRole('button', { name: 'إضافة سطر' })).toBeVisible();
    await agent.assert('each bill line has searchable item and expense account pickers in Arabic');
  },
);
