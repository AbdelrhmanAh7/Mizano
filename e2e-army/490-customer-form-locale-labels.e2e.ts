import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

test(
  '@issue-490 AC1: the new-customer form shows Arabic-only labels in RTL',
  { tags: ['feat:mz-customers'] },
  async ({ app, agent, screen, browser }) => {
    await app.open('/ar/login');
    await agent.act('sign in as {email} with password {pw}', {
      params: { email: 'admin@mizano.com', pw: 'password123' },
    });
    await app.open('/ar/sales/customers/new');
    await expect(screen.getByText('المعلومات الأساسية')).toBeVisible();
    await expect(screen.getByRole('button', { name: 'إنشاء عميل' })).toBeVisible();
    expect(await browser.evaluate(() => document.documentElement.dir)).toBe('rtl');
    await agent.assert(
      'the form labels are all in Arabic with no English words such as "Basic Information"',
    );
  },
);

test(
  '@issue-490 AC2: the new-customer form shows English labels in LTR',
  { tags: ['feat:mz-customers'] },
  async ({ app, agent, screen, browser }) => {
    await app.open('/en/login');
    await agent.act('sign in as {email} with password {pw}', {
      params: { email: 'admin@mizano.com', pw: 'password123' },
    });
    await app.open('/en/sales/customers/new');
    await expect(screen.getByText('Basic Information')).toBeVisible();
    await expect(screen.getByRole('button', { name: 'Create Customer' })).toBeVisible();
    expect(await browser.evaluate(() => document.documentElement.dir)).toBe('ltr');
  },
);
