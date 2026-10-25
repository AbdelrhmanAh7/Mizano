import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

test(
  '@issue-484 AC1/AC2/AC3: bill dropdowns follow Arabic and English direction',
  { tags: ['feat:mz-purchase-bills', 'lvl:ui'] },
  async ({ app, agent, screen, browser }) => {
    const email = process.env.E2E_USER_EMAIL || process.env.E2E_LOGIN_EMAIL;
    const pw = process.env.E2E_USER_PASSWORD || process.env.E2E_LOGIN_PASSWORD;
    if (!email || !pw) throw new Error('Set E2E_LOGIN_EMAIL and E2E_LOGIN_PASSWORD');
    await app.open('/en/login');
    await agent.act('sign in as {email} with password {pw}', { params: { email, pw } });
    const page = screen.page();
    for (const [locale, dir] of [['ar', 'rtl'], ['en', 'ltr']] as const) {
      await app.open(`/${locale}/purchases/bills/new`);
      expect(await browser.evaluate('document.documentElement.dir')).toBe(dir);
      const item = page.locator('tbody').getByRole('combobox').first();
      await expect(item).toBeVisible();
      for (const trigger of await page.locator('form').getByRole('combobox').all()) {
        await expect(trigger).toHaveAttribute('dir', dir);
      }
      for (const width of [375, 1280]) {
        await page.setViewportSize({ width, height: 1600 });
        await agent.act('open the Item/Account dropdown in the first bill line');
        await expect(screen.getByRole('listbox')).toHaveAttribute('dir', dir);
        await expect(screen.getByRole('option', { name: 'Manual Entry', exact: true })).toBeVisible();
        await page.screenshot({ path: `test-results/484-bill-${locale}-${width}.png`, fullPage: true, animations: 'disabled' });
        await page.keyboard.press('Escape');
        await expect(screen.getByRole('listbox')).not.toBeVisible();
        await expect(item).toBeFocused();
      }
      await agent.act('choose Manual Entry in the first bill line Item/Account dropdown');
      await expect(item).toContainText('Manual Entry');
      await agent.assert('the bill dropdown is readable and usable in the current page direction');
    }
  },
);
