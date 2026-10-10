import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { test, expect, request } from '@playwright/test';
import { apiURL } from './environment.mjs';
import {
  exactMoney,
  ledgerTotal,
  requiredStatus,
  reconcileTrialBalance,
  unchangedLedger,
} from './assertions.mjs';

const password = 'BrowserJourney123!';
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' });

async function call(api, method, path, status, data) {
  const response = await api.fetch(`${apiURL}${path}`, { method, data });
  // Do not include response bodies in diagnostics: they can contain auth/document data.
  try {
    requiredStatus(response.status(), status);
  } catch (error) {
    // Route/status metadata only; never copy response bodies or URL query parameters.
    throw new Error(
      `Required route: ${method} ${new URL(`${apiURL}${path}`).pathname} returned ${response.status()} expected ${status}`,
      { cause: error },
    );
  }
  return response.json();
}

async function seed(label) {
  const anonymous = await request.newContext();
  const name = `Browser ${label} ${randomUUID()}`;
  const email = `${randomUUID()}@mizano.test`;
  let login;
  try {
    await call(anonymous, 'POST', '/auth/register', 201, {
      email,
      password,
      firstName: 'Browser',
      lastName: label,
      organizationName: name,
    });
    login = await call(anonymous, 'POST', '/auth/login', 200, { email, password });
  } finally {
    await anonymous.dispose();
  }
  const api = await request.newContext({
    extraHTTPHeaders: { Authorization: `Bearer ${login.tokens.accessToken}` },
  });
  try {
    await call(api, 'POST', '/organization/onboarding/company-info', 201, {
      name,
      baseCurrency: 'USD',
    });
    await call(api, 'POST', '/organization/onboarding/chart-of-accounts', 201, {
      template: 'services',
      applyTemplate: true,
    });
    const accounts = (await call(api, 'GET', '/accounts?limit=500', 200)).data;
    const account = (code) => {
      const found = accounts.find((entry) => entry.code === code);
      expect(found, `Seed chart is missing account ${code}`).toBeDefined();
      return found.id;
    };
    await call(api, 'POST', '/organization/onboarding/opening-balances', 201, {
      openingDate: today(),
      balances: [
        { accountId: account('1110'), amount: '1000.0000', isDebit: true },
        { accountId: account('3100'), amount: '1000.0000', isDebit: false },
      ],
    });
    await call(api, 'POST', '/organization/onboarding/tax-config', 201, {
      taxRates: [{ name: 'Browser VAT', rate: 14, code: 'BROWSER14' }],
    });
    for (const step of ['import_data', 'ai_features']) {
      await call(api, 'POST', '/organization/onboarding/skip', 201, { step });
    }
    await call(api, 'POST', '/organization/onboarding/tour', 201, { completed: true });
    const onboarding = await call(api, 'GET', '/organization/onboarding', 200);
    expect(onboarding.isComplete).toBe(true);
    const bankName = `Browser bank ${label}`;
    await call(api, 'POST', '/bank-accounts', 201, {
      name: bankName,
      type: 'BANK',
      currency: 'USD',
      linkedAccountId: account('1110'),
    });
    const customerName = `Browser customer ${label}`;
    const customer = await call(api, 'POST', '/customers', 201, {
      name: customerName,
      currency: 'USD',
    });
    const vendor = await call(api, 'POST', '/vendors', 201, {
      name: `Browser vendor ${label}`,
      currency: 'USD',
    });
    const bill = await call(api, 'POST', '/bills', 201, {
      vendorId: vendor.id,
      date: today(),
      dueDate: today(),
      lines: [
        {
          accountId: account('6200'),
          description: 'Synthetic rent',
          quantity: '2.0000',
          rate: '100.0000',
          taxRate: '14.0000',
        },
      ],
    });
    expect(bill.status).toBe('DRAFT');
    exactMoney(bill.grandTotal, '228.0000');
    return {
      api,
      email,
      organizationId: login.organization.id,
      customer,
      customerName,
      vendor,
      bill,
      bankName,
      account,
    };
  } catch (error) {
    await api.dispose();
    throw error;
  }
}

async function loginUI(page, locale, tenant) {
  await page.goto(`/${locale}/login`);
  await page.locator('#email').fill(tenant.email);
  await page.locator('#password').fill(password);
  await page.locator('form button[type="submit"]').click();
  await expect(page).toHaveURL(new RegExp(`/${locale}/dashboard`));
  await expect(page.locator('html')).toHaveAttribute('lang', locale);
  await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
}

async function mutation(page, path, action, expected = 201, method = 'POST') {
  const pending = page.waitForResponse(
    (response) => response.url() === `${apiURL}${path}` && response.request().method() === method,
  );
  await action();
  const response = await pending;
  requiredStatus(response.status(), expected);
  return response.json();
}

async function select(page, placeholder, option) {
  await page.getByRole('combobox').filter({ hasText: placeholder }).click();
  await page.getByRole('option', { name: option, exact: true }).click();
}

for (const locale of ['en', 'ar']) {
  test(`${locale}: accountant creates/posts/pays and reconciles reports`, async ({
    page,
    browser,
  }, info) => {
    const failedRoutes = new Set();
    page.on('response', (response) => {
      if (response.status() >= 400 && failedRoutes.size < 20) {
        const url = new URL(response.url());
        if (url.origin === new URL(apiURL).origin) {
          failedRoutes.add(`${response.request().method()} ${url.pathname} ${response.status()}`);
        }
      }
    });
    // Playwright 1.56.1 respects an explicit error-context attachment instead of
    // persisting its automatic page snapshot, which could contain financial data.
    await info.attach('error-context', {
      body: 'Metadata only: fixture IDs, final page path and failure source location.',
      contentType: 'text/plain',
    });
    let a;
    let b;
    let other;
    try {
      a = await seed(`${locale}-A`);
      b = await seed(`${locale}-B`);
      other = await browser.newContext();
      // Only fixture IDs are attached, never credentials or amounts.
      const fixturePath = info.outputPath('fixture-ids.json');
      await writeFile(
        fixturePath,
        JSON.stringify({
          tenantA: a.organizationId,
          tenantB: b.organizationId,
          bill: a.bill.id,
        }),
      );
      await info.attach('fixture-ids', {
        path: fixturePath,
        contentType: 'application/json',
      });
      await loginUI(page, locale, a);
      const otherPage = await other.newPage();
      await loginUI(otherPage, locale, b);
      const sessions = await Promise.all([
        page.context().request.get('/api/auth/session'),
        other.request.get('/api/auth/session'),
      ]);
      expect((await sessions[0].json()).user.organizationId).toBe(a.organizationId);
      expect((await sessions[1].json()).user.organizationId).toBe(b.organizationId);
      // Opening balances were posted by the real onboarding command, not direct DB inserts.
      exactMoney(
        (await call(a.api, 'GET', `/accounts/${a.account('1110')}/balance`, 200)).balance,
        '1000.0000',
      );

      await page.goto(`/${locale}/sales/invoices/new`);
      // Opt-in mutation runs must FAIL this same journey, never turn it into a passing test.
      if (process.env.MIZANO_BROWSER_MUTATION) {
        await page.route(`${apiURL}/invoices`, async (route) => {
          if (route.request().method() !== 'POST') return route.continue();
          if (process.env.MIZANO_BROWSER_MUTATION === 'required-route') {
            return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
          }
          const response = await route.fetch();
          requiredStatus(response.status(), 201);
          const body = await response.json();
          await route.fulfill({ response, json: { ...body, grandTotal: '999.0000' } });
        });
      }
      await page.locator('#invoiceDate').fill(today());
      await page.locator('#dueDate').fill(today());
      await select(page, 'Select a customer', a.customerName);
      await page.getByPlaceholder('Description', { exact: true }).fill('Synthetic consulting');
      await page.getByPlaceholder('1', { exact: true }).fill('2.0000');
      const invoiceLine = page.getByPlaceholder('Description', { exact: true }).locator('../..');
      await invoiceLine.getByPlaceholder('0.00', { exact: true }).fill('100.0000');
      await select(page, 'No tax', 'Browser VAT (14%)');
      const invoice = await mutation(page, '/invoices', () =>
        page.locator('form button[type="submit"]').click(),
      );
      expect(invoice.status).toBe('DRAFT');
      exactMoney(invoice.subtotal, '200.0000');
      exactMoney(invoice.taxAmount, '28.0000');
      exactMoney(invoice.grandTotal, '228.0000');
      // Wait for the form's own navigation; racing it with goto aborts either navigation.
      await expect(page).toHaveURL(new RegExp(`/${locale}/sales/invoices/${invoice.id}$`));
      await page
        .getByRole('button', { name: locale === 'ar' ? 'إرسال' : 'Send', exact: true })
        .click();
      const sent = await mutation(
        page,
        `/invoices/${invoice.id}/send`,
        () =>
          page
            .getByRole('alertdialog')
            .getByRole('button', {
              name: locale === 'ar' ? 'إرسال الفاتورة' : 'Send Invoice',
              exact: true,
            })
            .click(),
        200,
        'PATCH',
      );
      expect(sent.status).toBe('SENT');

      await page.goto(`/${locale}/purchases/bills/${a.bill.id}`);
      const approvalButton = page.getByRole('button', {
        name: locale === 'ar' ? 'اعتماد وترحيل' : 'Approve & post',
        exact: true,
      });
      const beforeFailure = await call(a.api, 'GET', '/accounts/balances', 200);
      // Inject one transport failure. The real draft must survive, then a user retry posts it.
      await page.route(
        `${apiURL}/bills/${a.bill.id}/approve`,
        async (route) => {
          await route.fulfill({
            status: 503,
            contentType: 'application/json',
            body: '{"message":"Synthetic unavailable"}',
          });
        },
        { times: 1 },
      );
      await mutation(page, `/bills/${a.bill.id}/approve`, () => approvalButton.click(), 503);
      expect((await call(a.api, 'GET', `/bills/${a.bill.id}`, 200)).status).toBe('DRAFT');
      unchangedLedger(beforeFailure, await call(a.api, 'GET', '/accounts/balances', 200));
      const approved = await mutation(page, `/bills/${a.bill.id}/approve`, () =>
        approvalButton.click(),
      );
      expect(approved.status).toBe('OPEN');
      exactMoney(approved.balanceDue, '228.0000');

      await page.goto(
        `/${locale}/sales/payments/new?invoiceId=${invoice.id}&customerId=${a.customer.id}`,
      );
      await expect(page.locator('#amount')).toHaveValue('228');
      await page.locator('#date').fill(today());
      await select(
        page,
        'Select account',
        `1110 - ${(await call(a.api, 'GET', `/accounts/${a.account('1110')}`, 200)).name}`,
      );
      const received = await mutation(page, '/payments-received', () =>
        page.locator('form button[type="submit"]').click(),
      );
      exactMoney(received.amount, '228.0000');
      await expect(page).toHaveURL(new RegExp(`/${locale}/sales/payments/${received.id}$`));
      const paidInvoice = await call(a.api, 'GET', `/invoices/${invoice.id}`, 200);
      expect(paidInvoice.status).toBe('PAID');
      exactMoney(paidInvoice.balanceDue, '0.0000');

      await page.goto(
        `/${locale}/purchases/payments/new?billId=${a.bill.id}&vendorId=${a.vendor.id}`,
      );
      await expect(page.locator('#amount')).toHaveValue('228');
      await page.locator('#amount').fill('100.0000');
      await page
        .getByRole('row')
        .filter({ hasText: a.bill.billNumber })
        .getByRole('spinbutton')
        .fill('100.0000');
      await select(page, 'Select account', a.bankName);
      const made = await mutation(page, '/payments-made', () =>
        page.locator('form button[type="submit"]').click(),
      );
      exactMoney(made.amount, '100.0000');
      await writeFile(
        fixturePath,
        JSON.stringify({
          tenantA: a.organizationId,
          tenantB: b.organizationId,
          bill: a.bill.id,
          invoice: invoice.id,
          paymentReceived: received.id,
          paymentMade: made.id,
        }),
      );
      await info.attach('posted-fixture-ids', {
        path: fixturePath,
        contentType: 'application/json',
      });
      await expect(page).toHaveURL(new RegExp(`/${locale}/purchases/payments$`));
      const paidBill = await call(a.api, 'GET', `/bills/${a.bill.id}`, 200);
      expect(paidBill.status).toBe('PARTIALLY_PAID');
      exactMoney(paidBill.balanceDue, '128.0000');

      const balances = await call(a.api, 'GET', '/accounts/balances', 200);
      const balance = (code) => balances.find((entry) => entry.accountCode === code).balance;
      exactMoney(balance('1110'), '1128.0000');
      exactMoney(balance('2000'), '128.0000');
      exactMoney(balance('1200'), '0.0000');
      const debits = ledgerTotal(balances, 'totalDebits');
      expect(debits).toBe(ledgerTotal(balances, 'totalCredits'));
      const report = await call(a.api, 'GET', `/reports/trial-balance?asOfDate=${today()}`, 200);
      expect(report.currencyCode).toBe('USD');
      expect(report.basis).toBe('POSTED_LEDGER');
      reconcileTrialBalance(report, balances);
      expect(report.isBalanced).toBe(true);
      // Trial balance reports net account balances; gross journal turnover is checked above.
      exactMoney(report.totals.debit, '1356.0000');
      exactMoney(report.totals.credit, '1356.0000');
      await page.goto(`/${locale}/reports/trial-balance`);
      await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
      await expect(
        page.getByRole('heading', {
          level: 1,
          name: locale === 'ar' ? 'ميزان المراجعة' : 'Trial Balance',
          exact: true,
        }),
      ).toBeVisible();
      await expect(page.locator('tfoot td').nth(1)).toHaveText('$1,356.00');
      await expect(page.locator('tfoot td').nth(2)).toHaveText('$1,356.00');
      const bankRow = page
        .getByRole('row')
        .filter({ has: page.getByRole('cell', { name: '1110', exact: true }) });
      await expect(bankRow.getByRole('cell').nth(3)).toHaveText('$1,128.00');
      const apRow = page
        .getByRole('row')
        .filter({ has: page.getByRole('cell', { name: '2000', exact: true }) });
      await expect(apRow.getByRole('cell').nth(4)).toHaveText('$128.00');
      // Compare every rendered row to the reconciled report, including zero-side dashes.
      for (const account of report.accounts) {
        const row = page.getByRole('row').filter({
          has: page.getByRole('cell', { name: account.code, exact: true }),
        });
        const display = (value) =>
          value === '0.0000' ? '-' : `$${value.slice(0, -2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
        await expect(row.getByRole('cell').nth(3)).toHaveText(display(account.debit));
        await expect(row.getByRole('cell').nth(4)).toHaveText(display(account.credit));
      }
      const aging = await call(a.api, 'GET', `/reports/payables-aging?asOfDate=${today()}`, 200);
      exactMoney(aging.summary.netTotal, '128.0000');
      exactMoney(aging.summary.netTotal, balance('2000'));
      const receivables = await call(
        a.api,
        'GET',
        `/reports/receivables-aging?asOfDate=${today()}`,
        200,
      );
      exactMoney(receivables.summary.netTotal, balance('1200'));
      await page.goto(`/${locale}/reports/ap-aging`);
      await page.getByRole('button').filter({ hasText: '$128.00' }).click();
      await info.attach('aging-row-count', {
        body: String(await page.getByRole('row').filter({ hasText: a.vendor.name }).count()),
        contentType: 'text/plain',
      });
      await expect(
        page.getByRole('row').filter({ hasText: a.vendor.name }).getByRole('cell').nth(5),
      ).toHaveText('$128.00');

      // A repeated approval must be rejected and must never change the ledger.
      await call(a.api, 'POST', `/bills/${a.bill.id}/approve`, 400);
      const afterRetry = await call(a.api, 'GET', '/accounts/balances', 200);
      expect(ledgerTotal(afterRetry, 'totalDebits')).toBe(debits);
      expect(ledgerTotal(afterRetry, 'totalCredits')).toBe(debits);
      unchangedLedger(balances, afterRetry);
      const lockedBill = await call(a.api, 'POST', '/bills', 201, {
        vendorId: a.vendor.id,
        date: '2000-01-01',
        dueDate: '2000-01-31',
        lines: [
          {
            accountId: a.account('6200'),
            description: 'Synthetic locked draft',
            quantity: '1.0000',
            rate: '10.0000',
          },
        ],
      });
      await call(a.api, 'PATCH', '/organization/lock-date', 200, {
        lockDate: '2000-12-31T00:00:00.000Z',
      });
      await call(a.api, 'POST', `/bills/${lockedBill.id}/approve`, 400);
      expect((await call(a.api, 'GET', `/bills/${lockedBill.id}`, 200)).status).toBe('DRAFT');
      unchangedLedger(balances, await call(a.api, 'GET', '/accounts/balances', 200));

      // Two independent tenant refreshes run concurrently through the real auth endpoint.
      const refreshSessions = await Promise.all([
        page.context().request.get('/api/auth/session'),
        other.request.get('/api/auth/session'),
      ]);
      const refreshTokens = await Promise.all(
        refreshSessions.map(async (response) => (await response.json()).refreshToken),
      );
      const refreshed = await Promise.all(
        refreshTokens.map(async (refreshToken) => {
          const anonymous = await request.newContext({
            extraHTTPHeaders: { Authorization: `Bearer ${refreshToken}` },
          });
          try {
            return (await call(anonymous, 'POST', '/auth/refresh', 200, { refreshToken })).tokens;
          } finally {
            await anonymous.dispose();
          }
        }),
      );
      const refreshedClients = await Promise.all(
        refreshed.map((tokens) =>
          request.newContext({
            extraHTTPHeaders: { Authorization: `Bearer ${tokens.accessToken}` },
          }),
        ),
      );
      try {
        expect((await call(refreshedClients[0], 'GET', '/organization', 200)).id).toBe(
          a.organizationId,
        );
        expect((await call(refreshedClients[1], 'GET', '/organization', 200)).id).toBe(
          b.organizationId,
        );
      } finally {
        await Promise.all(refreshedClients.map((client) => client.dispose()));
      }

      await call(b.api, 'GET', `/invoices/${invoice.id}`, 404);
      await call(b.api, 'GET', `/bills/${a.bill.id}`, 404);
      const bInvoices = await call(b.api, 'GET', '/invoices?limit=100', 200);
      expect(bInvoices.data).toHaveLength(0);
      const anonymous = await request.newContext();
      try {
        await call(anonymous, 'GET', '/reports/trial-balance', 401);
      } finally {
        await anonymous.dispose();
      }
    } finally {
      await info.attach('failed-route-metadata', {
        body: [...failedRoutes].join('\n'),
        contentType: 'text/plain',
      });
      await info.attach('last-page-path', {
        body: new URL(page.url()).pathname,
        contentType: 'text/plain',
      });
      await other?.close();
      await a?.api.dispose();
      await b?.api.dispose();
    }
  });
}
