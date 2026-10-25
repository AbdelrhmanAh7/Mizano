import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

test(
  '@issue-484 AC1/AC2/AC3: bill dropdowns follow Arabic and English direction',
  { tags: ['feat:mz-purchase-bills', 'lvl:ui'] },
  async ({ app, agent, screen, browser }) => {
    await app.open('/en/login');
    await agent.act('sign in as {email} with password {pw}', {
      params: { email: 'admin@mizano.com', pw: 'password123' },
    });
    const page = screen.page();
    for (const [locale, dir] of [
      ['ar', 'rtl'],
      ['en', 'ltr'],
    ] as const) {
      await app.open(`/${locale}/purchases/bills/new`);
      expect(await browser.evaluate('document.documentElement.dir')).toBe(dir);
      const item = page.locator('tbody').getByRole('combobox').first();
      await expect(item).toBeVisible();
      for (const trigger of await page.locator('form').getByRole('combobox').all()) {
        await expect(trigger).toHaveAttribute('dir', dir);
      }
      await item.click();
      await expect(screen.getByRole('listbox')).toHaveAttribute('dir', dir);
      const manual = screen.getByRole('option', { name: 'Manual Entry', exact: true });
      await expect(manual).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(screen.getByRole('listbox')).not.toBeVisible();
      await expect(item).toBeFocused();
      await item.click();
      await manual.click();
      await expect(item).toContainText('Manual Entry');
    }
  },
);
