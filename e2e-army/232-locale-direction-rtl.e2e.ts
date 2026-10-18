import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

/**
 * Demo admin sign-in helper using locators without relying on LLM agent steps.
 * Handles the redirect if the session is already authenticated.
 */
async function signIn({ app, screen, browser }: any) {
  for (let i = 0; i < 3; i++) {
    await app.open('/en/login');
    const currentUrl = await browser.url();
    if (/\/en\/(dashboard|onboarding|accounting|sales)/.test(currentUrl)) {
      return;
    }
    const button = screen.getByRole('button', 'Sign In');
    const isVisible = await button.isVisible().catch(() => false);
    if (!isVisible) {
      const url = await browser.url();
      if (/\/en\/(dashboard|onboarding|accounting|sales)/.test(url)) return;
    }
    await expect(button).toBeVisible({ timeout: 25_000 });
    await screen.getByRole('textbox', 'Email').fill('admin@mizano.com');
    await screen.getByRole('textbox', 'Password').fill('password123');
    await button.tap();
    try {
      await expect(browser).toHaveURL(/\/en\/(dashboard|onboarding|accounting|sales)/, { timeout: 40_000 });
      return;
    } catch (e) {
      if (i === 2) throw e;
    }
  }
}

test(
  '@issue-232 @pr-232 AC1: on /ar, html[dir=rtl] is set and ArrowLeft moves focus to the next tab in RTL',
  { tags: ['feat:mz-i18n-rtl', 'feat:mz-web-i18n', 'lvl:ui'] },
  async ({ app, screen, browser }) => {
    await signIn({ app, screen, browser });

    await app.open('/ar/dashboard');
    await expect(browser).toHaveURL(/\/ar\/dashboard/, { timeout: 30_000 });

    // Assert document element direction and language for Arabic
    const dir = await browser.evaluate(() => document.documentElement.dir);
    expect(dir).toBe('rtl');
    const lang = await browser.evaluate(() => document.documentElement.lang);
    expect(lang).toBe('ar');

    // Screenshot artifact for Arabic RTL dashboard
    await app.screenshot('232-ar-dashboard-rtl');

    // Locate the first (Overview / نظرة عامة) and second (Financial / مالي) tabs
    const overviewTab = browser.locator('[role="tab"][value="overview"]');
    const financialTab = browser.locator('[role="tab"][value="financial"]');

    await expect(overviewTab).toBeVisible({ timeout: 30_000 });
    await expect(financialTab).toBeVisible({ timeout: 30_000 });

    // Focus the first tab
    await overviewTab.focus();
    await expect(overviewTab).toBeFocused();

    // In RTL, pressing ArrowLeft moves focus to the next tab in reading order
    await browser.keyboard.press('ArrowLeft');
    await expect(financialTab).toBeFocused();
  },
);

test(
  '@issue-232 @pr-232 AC2: on /en, dir=ltr is set and ArrowRight moves focus to the next tab in LTR',
  { tags: ['feat:mz-i18n-rtl', 'feat:mz-web-i18n', 'lvl:ui'] },
  async ({ app, screen, browser }) => {
    await signIn({ app, screen, browser });

    await app.open('/en/dashboard');
    await expect(browser).toHaveURL(/\/en\/dashboard/, { timeout: 30_000 });

    // Assert document element direction and language for English
    const dir = await browser.evaluate(() => document.documentElement.dir);
    expect(dir).toBe('ltr');
    const lang = await browser.evaluate(() => document.documentElement.lang);
    expect(lang).toBe('en');

    // Screenshot artifact for English LTR dashboard
    await app.screenshot('232-en-dashboard-ltr');

    // Locate the first (Overview) and second (Financial) tabs
    const overviewTab = browser.locator('[role="tab"][value="overview"]');
    const financialTab = browser.locator('[role="tab"][value="financial"]');

    await expect(overviewTab).toBeVisible({ timeout: 30_000 });
    await expect(financialTab).toBeVisible({ timeout: 30_000 });

    // Focus the first tab
    await overviewTab.focus();
    await expect(overviewTab).toBeFocused();

    // In LTR, pressing ArrowRight moves focus to the next tab in reading order
    await browser.keyboard.press('ArrowRight');
    await expect(financialTab).toBeFocused();
  },
);
