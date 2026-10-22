import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

// The verify stack serves the web app only (the API is on another port), so these tests drive the
// payslip page the way an accountant does and check the PDF response the page requests.
// The seeded demo org has the paid run "payroll-feb-2026" with three payslips.
const RUN_PATH = '/hr/payroll/payroll-feb-2026';
// The seed gives its payslips stable ids, so a payslip page can be opened by URL.
const SEEDED_PAYSLIP_ID = 'payslip-feb-2026-emp-001';

/** Demo admin sign-in with locators; next dev may submit the form before hydration, so retry. */
async function signIn({ app, screen, browser }: any): Promise<void> {
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
      return;
    } catch (error) {
      if (i === 2) throw error;
    }
  }
}

/** Opens the first seeded payslip of the run in the given locale and returns its page path. */
async function openFirstPayslip({ app, screen }: any, locale: 'en' | 'ar'): Promise<void> {
  await app.open(`/${locale}${RUN_PATH}`);
  const href = await screen.getByRole('link', 'View').first().getAttribute('href');
  expect(href).toContain('/hr/payslips/');
  const payslipPath = String(href).replace(/^\/(en|ar)(?=\/)/, '');
  await app.open(`/${locale}${payslipPath}`);
}

for (const locale of ['en', 'ar'] as const) {
  test(
    `@issue-256 AC1+AC2: the ${locale} payslip page downloads an attachment PDF in ${locale}`,
    { tags: ['feat:mz-payroll', 'lvl:ui'] },
    async (fx: any) => {
      const { screen, browser } = fx;
      await signIn(fx);
      await openFirstPayslip(fx, locale);

      if (locale === 'ar') {
        expect(await browser.evaluate(() => document.documentElement.dir)).toBe('rtl');
        await expect(screen.getByText('تحميل PDF')).toBeVisible();
      } else {
        expect(await browser.evaluate(() => document.documentElement.dir)).toBe('ltr');
        await expect(screen.getByText('Download PDF')).toBeVisible();
      }

      const response = browser.waitForResponse(/\/payslips\/[^/?]+\/pdf/);
      await screen.getByTestId('download-pdf-button').tap();
      const pdf = await response;

      expect(pdf.status).toBe(200);
      expect(pdf.url).toContain(`lang=${locale}`);
      expect(pdf.headers['content-type']).toContain('application/pdf');
      expect(pdf.headers['content-disposition']).toContain('attachment');
      expect(pdf.headers['content-disposition']).toContain('payslip-');
    },
  );
}

test(
  '@issue-256 AC5: an unknown payslip id shows not-found and no download button',
  { tags: ['feat:mz-payroll', 'lvl:ui'] },
  async (fx: any) => {
    const { app, screen } = fx;
    await signIn(fx);
    await app.open('/en/hr/payslips/army-256-missing');
    await expect(screen.getByText('not found')).toBeVisible();
    await expect(screen.getByTestId('download-pdf-button')).toHaveCount(0);
  },
);

test(
  '@issue-256 AC1: a seeded payslip opens by its stable URL and offers the PDF download',
  { tags: ['feat:mz-payroll', 'lvl:ui'] },
  async (fx: any) => {
    const { app, screen } = fx;
    await signIn(fx);
    await app.open(`/en/hr/payslips/${SEEDED_PAYSLIP_ID}`);
    await expect(screen.getByTestId('download-pdf-button')).toBeVisible();

    const response = fx.browser.waitForResponse(/\/payslips\/[^/?]+\/pdf/);
    await screen.getByTestId('download-pdf-button').tap();
    const pdf = await response;
    expect(pdf.status).toBe(200);
    expect(pdf.url).toContain(`/payslips/${SEEDED_PAYSLIP_ID}/pdf`);
    expect(pdf.headers['content-type']).toContain('application/pdf');
  },
);

