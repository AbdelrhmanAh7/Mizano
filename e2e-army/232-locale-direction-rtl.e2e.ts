import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

// Dashboard tabs live in apps/web/components/dashboard/dashboard-client.tsx (Overview, Financial,
// ...); labels come from messages/{en,ar}/common.json under dashboard.sections.
const LOCALES = {
  ar: { dir: 'rtl', first: 'نظرة عامة', second: 'مالي', next: 'ArrowLeft' },
  en: { dir: 'ltr', first: 'Overview', second: 'Financial', next: 'ArrowRight' },
} as const;

// The dashboard auto-starts a driver.js tour after 1.5 s that covers the page and takes the arrow
// keys. Mark it dismissed in the store it persists to (apps/web/lib/stores/use-tour-store.ts).
const TOUR_DISMISSED = JSON.stringify({
  state: { completedTours: [], dismissedTours: ['dashboard'] },
  version: 0,
});

test(
  '@issue-232 @pr-232 AC1 AC2 AC3: html dir/lang follow the locale, Radix tab arrow keys follow reading direction, and a client-side language switch updates the direction',
  { tags: ['feat:mz-i18n-rtl', 'lvl:ui'] },
  async ({ app, browser, screen }) => {
    await browser.addInitScript((value: string) => {
      localStorage.setItem('tour-storage', value);
    }, TOUR_DISMISSED);

    // Locator sign-in as the seeded demo admin (no model call). next dev compiles on the first hit
    // and a submit before hydration is a plain GET, so retry the form like the hub suite does.
    for (let i = 0; i < 3; i++) {
      await app.open('/en/login');
      await expect(screen.getByRole('button', 'Sign In')).toBeVisible();
      await screen.getByRole('textbox', 'Email').fill('admin@mizano.com');
      await screen.getByRole('textbox', 'Password').fill('password123');
      await screen.getByRole('button', 'Sign In').tap();
      try {
        await expect(browser).toHaveURL(/\/en\/(dashboard|onboarding|accounting|sales)/, {
          timeout: 40_000,
        });
        break;
      } catch (e) {
        if (i === 2) throw e;
      }
    }

    // AC1 (ar) and AC2 (en): a full load sets html dir/lang, direction indicator, and the Radix tabs move
    // focus to the next tab with the reading-direction arrow key (ArrowLeft in RTL, ArrowRight in LTR).
    for (const locale of ['ar', 'en'] as const) {
      const l = LOCALES[locale];
      await app.open(`/${locale}/dashboard`);
      await expect(browser.locator('html')).toHaveAttribute('dir', l.dir);
      await expect(browser.locator('html')).toHaveAttribute('lang', locale);
      await expect(screen.getByTestId('direction-indicator')).toHaveTextContent(
        locale === 'ar' ? 'RTL' : 'LTR',
      );
      await expect(screen.getByTestId('direction-indicator')).toHaveAttribute('data-direction', l.dir);

      const first = screen.getByRole('tab', l.first);
      await expect(first).toBeVisible();
      await app.screenshot(`232-${locale}-dashboard`);
      await first.focus();
      await first.press(l.next);
      await expect(screen.getByRole('tab', l.second)).toBeFocused();
    }

    // AC3: switching Arabic -> English with the header language menu is a client-side navigation;
    // html dir/lang and direction indicator must follow it without a full reload.
    await app.open('/ar/dashboard');
    await expect(browser.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(screen.getByTestId('direction-indicator')).toHaveTextContent('RTL');
    await screen.getByRole('button', 'اللغة').tap();
    await screen.getByRole('menuitem', 'English').tap();
    await browser.waitForURL(/\/en\//);
    await expect(browser.locator('html')).toHaveAttribute('dir', 'ltr');
    await expect(browser.locator('html')).toHaveAttribute('lang', 'en');
    await expect(screen.getByTestId('direction-indicator')).toHaveTextContent('LTR');
    await app.screenshot('232-switched-to-en');
  },
);
