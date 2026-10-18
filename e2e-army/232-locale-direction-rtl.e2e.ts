import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

type Fixtures = Parameters<Parameters<typeof test>[2]>[0];

// Dashboard tabs live in apps/web/components/dashboard/dashboard-client.tsx (Overview, Financial,
// ...); labels come from messages/{en,ar}/common.json under dashboard.sections.
const TABS = {
  en: { first: 'Overview', second: 'Financial', dir: 'ltr', key: 'ArrowRight' },
  ar: { first: 'نظرة عامة', second: 'مالي', dir: 'rtl', key: 'ArrowLeft' },
} as const;

async function checkLocale(
  { app, browser }: Pick<Fixtures, 'app' | 'browser'>,
  locale: keyof typeof TABS,
): Promise<void> {
  const t = TABS[locale];
  await app.open(`/${locale}/dashboard`);
  await expect(browser.locator('html')).toHaveAttribute('dir', t.dir);
  await expect(browser.locator('html')).toHaveAttribute('lang', locale);
  await app.screenshot(`232-${locale}-dashboard`);

  const first = browser.getByRole('tab', { name: t.first });
  const second = browser.getByRole('tab', { name: t.second });
  await first.focus();
  await browser.keyboard.press(t.key);
  await expect(second).toBeFocused();
}

test(
  '@issue-232 @pr-232 AC1 AC2: html dir/lang follow the locale and Radix tab arrow keys follow reading direction',
  { tags: ['feat:mz-web-i18n', 'lvl:ui'] },
  async ({ app, agent, browser }: Fixtures) => {
    // One login, same seeded admin and agent step as the other e2e-army specs.
    await app.open('/en/login');
    await agent.act('sign in as {email} with password {pw}', {
      params: { email: 'admin@mizano.com', pw: 'password123' },
    });

    await checkLocale({ app, browser }, 'ar');
    await checkLocale({ app, browser }, 'en');
  },
);
