import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

/**
 * Every public page, in both languages, on a phone and a desktop: each button and link has a
 * readable name and enough contrast (WCAG AA). Issue #676: a white label on a white button looked
 * like an empty box on the landing page. Scrolled to the bottom so the whole page has rendered.
 */
const PAGES = ['/onboarding', '/login', '/register', '/forgot-password', '/terms', '/privacy'];
const SIZES = [
  { name: 'phone', width: 390, height: 844 },
  { name: 'desktop', width: 1440, height: 900 },
];

for (const locale of ['ar', 'en'] as const) {
  for (const size of SIZES) {
    test.describe(`public pages, ${locale}, ${size.name} @happy`, () => {
      test.use({ viewport: { width: size.width, height: size.height } });

      for (const path of PAGES) {
        test(`${path} has named, readable buttons and links`, async ({ page }) => {
          await page.goto(`/${locale}${path}`);
          await page.waitForLoadState('networkidle');
          await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));

          const { violations } = await new AxeBuilder({ page })
            .withRules(['button-name', 'link-name', 'color-contrast'])
            .analyze();
          const found = violations.map((v) => ({
            rule: v.id,
            nodes: v.nodes.map((n) => n.target.join(' ')),
          }));
          expect(found).toEqual([]);
        });
      }
    });
  }
}

test('the landing call-to-action names both buttons in Arabic on a phone (#676) @happy', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/ar/onboarding');
  const cta = page.locator('section').filter({ hasText: 'هل أنت مستعد للبدء؟' });
  await expect(cta.getByRole('link', { name: 'إنشاء حساب' })).toBeVisible();
  const signIn = cta.getByRole('link', { name: 'تسجيل الدخول' });
  await expect(signIn).toBeVisible();
  // White label on a see-through button over the dark green band, never on white.
  await expect(signIn).toHaveCSS('color', 'rgb(255, 255, 255)');
  await expect(signIn).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
});
