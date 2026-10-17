import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

const SEED = 'army-216';
const LOGIN = { email: 'admin@mizano.com', pw: 'password123' };

test(
  '@issue-216 AC1-AC4: a UI bill with an expense account per line approves once, takes a payment and keeps the trial balance balanced',
  { tags: ['feat:mz-purchase-bills', 'lvl:ui'] },
  async ({ app, agent, screen }) => {
    await app.open('/en/login');
    await agent.act('sign in as {email} with password {pw}', { params: LOGIN });

    await app.open('/en/purchases/vendors/new');
    await agent.act('create a vendor named {name}', { params: { name: `${SEED}-vendor` } });

    await app.open('/en/purchases/bills/new');
    await agent.act('choose the vendor {vendor}', { params: { vendor: `${SEED}-vendor` } });
    await agent.act(
      'on the first line keep "Manual Entry", type the description {desc}, quantity {qty} and unit price {rate}',
      { params: { desc: `${SEED}-office-supplies`, qty: '1', rate: '100' } },
    );
    await expect(screen.getByText('Expense account').first()).toBeVisible();
    await agent.act('in the Expense account select of the first line choose any expense account');
    await agent.act('click Create Bill');
    await agent.assert('the bill was saved and the page left the new-bill form without errors');

    await app.open('/en/purchases/bills');
    await agent.act('open the draft bill of vendor {vendor}', {
      params: { vendor: `${SEED}-vendor` },
    });
    await agent.act('click "Approve & post" twice quickly and confirm if asked');
    await agent.assert(
      'the bill status is Approved and no error about a missing expense account is shown',
    );
    await agent.assert('the bill shows exactly one journal entry posted for it');

    await agent.act('record a full payment of this bill from a bank or cash account');
    await agent.assert('the payment was recorded and the bill is now paid or its balance due is 0');

    await app.open('/en/reports/trial-balance');
    await agent.assert('the trial balance total debits equal total credits (it is balanced)');
  },
);

test(
  '@issue-216 AC3 (invalid): a bill line without an expense account is not saved',
  { tags: ['feat:mz-purchase-bills', 'lvl:ui'] },
  async ({ app, agent, screen }) => {
    await app.open('/en/login');
    await agent.act('sign in as {email} with password {pw}', { params: LOGIN });

    await app.open('/en/purchases/bills/new');
    await agent.act('choose any vendor');
    await agent.act(
      'on the first line type the description {desc}, quantity {qty} and unit price {rate} and leave the Expense account empty',
      { params: { desc: `${SEED}-no-account`, qty: '1', rate: '50' } },
    );
    await agent.act('click Create Bill');
    await expect(screen.getByText(/Choose an expense account/).first()).toBeVisible();
    await agent.assert('the new-bill form is still open and no bill was created');
  },
);

test(
  '@issue-216 AC6: the expense account picker is labelled in Arabic and the page is RTL',
  { tags: ['feat:mz-purchase-bills', 'feat:mz-bill-scan', 'lvl:ui'] },
  async ({ app, agent, screen, browser }) => {
    await app.open('/ar/login');
    await agent.act('sign in as {email} with password {pw}', { params: LOGIN });

    await app.open('/ar/purchases/bills/new');
    await expect(screen.getByText('حساب المصروف').first()).toBeVisible();
    expect(await browser.evaluate(() => document.documentElement.dir)).toBe('rtl');
    await agent.assert('each bill line has an expense account select labelled in Arabic');
  },
);

test(
  '@issue-216 AC1 (review): switching a line from an item back to Manual Entry drops the item account',
  { tags: ['feat:mz-purchase-bills', 'lvl:ui'] },
  async ({ app, agent, screen }) => {
    await app.open('/en/login');
    await agent.act('sign in as {email} with password {pw}', { params: LOGIN });

    await app.open('/en/purchases/bills/new');
    await agent.act('in the Item select of the first line choose {item}', {
      params: { item: 'Keyboard Mechanical' },
    });
    await expect(screen.getByText('5000 · Cost of Goods Sold').first()).toBeVisible();
    await agent.act('in the Item select of the first line choose "Manual Entry"');
    await agent.assert(
      'the Expense account select of the first line is empty again and shows "Choose an expense account"',
    );
    await agent.act(
      'choose any vendor, type the description {desc} and unit price {rate}, then click Create Bill',
      {
        params: { desc: `${SEED}-manual-after-item`, rate: '40' },
      },
    );
    await expect(screen.getByText(/Choose an expense account/).first()).toBeVisible();
    await agent.assert('the new-bill form is still open and no bill was created');
  },
);
