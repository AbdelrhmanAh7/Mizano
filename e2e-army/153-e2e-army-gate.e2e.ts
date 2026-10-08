// @issue-153: tester-army/e2e is the in-repo E2E gate. These tests cover the MVP flows the gate must prove on every PR (sign-in,
// ledger entry, sales invoice, Arabic RTL) without a model (locators + request-level checks), so they run identically in the hub's
// verify job, in `pnpm e2e:army` and in the GitHub `e2e-army` job, and replay deterministically (fixed data, no sleeps).
// Self-contained on purpose: the hub copies e2e-army/*.e2e.ts into its own runner, so only `@e2e-dev/web` and `e2e` are imported.
import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

const ADMIN = { email: 'admin@mizano.com', password: 'password123' }; // public seed credentials of the throwaway test DB
const TENANT = { email: 'army-153@army-e2e.test', password: 'ArmyE2e2026x', org: 'Mizano E2E 153' };
const API = () => (process.env.E2E_ARMY_API ?? 'http://127.0.0.1:6001/api').replace(/\/+$/, '');

interface Res {
  status: number;
  body: any;
}
async function call(method: string, path: string, body?: unknown, token?: string): Promise<Res> {
  const once = async (): Promise<Res> => {
    const headers: Record<string, string> = { accept: 'application/json' };
    if (token) headers.authorization = `Bearer ${token}`;
    if (body !== undefined) headers['content-type'] = 'application/json';
    const res = await fetch(API() + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    try {
      return { status: res.status, body: JSON.parse(text) };
    } catch {
      return { status: res.status, body: text };
    }
  };
  let r = await once();
  // the auth endpoints allow 5 requests per minute: wait the window out instead of failing
  if (r.status === 429)
    await expect
      .poll(async () => (r = await once()).status, { timeout: 85_000, interval: 5_000 })
      .not.toBe(429);
  return r;
}
/** Decimal string without trailing fraction zeros ("228.0000" -> "228"), compared as text: money is never a float. */
const dec = (v: unknown): string => {
  const s = String(v);
  return s.includes('.') ? s.replace(/0+$/, '').replace(/\.$/, '') : s;
};
const rows = (r: Res): any[] =>
  Array.isArray(r.body) ? r.body : Array.isArray(r.body?.data) ? r.body.data : [];

/** An isolated organization with the default chart of accounts (registered once, logged into on a re-run of the same DB). */
let tenantP: Promise<{ token: string; chart: Map<string, string> }> | null = null;
function tenant() {
  tenantP ??= (async () => {
    let r = await call('POST', '/auth/register', {
      email: TENANT.email,
      password: TENANT.password,
      firstName: 'E2E',
      lastName: 'Gate',
      organizationName: TENANT.org,
    });
    if (r.status === 409)
      r = await call('POST', '/auth/login', { email: TENANT.email, password: TENANT.password });
    expect([200, 201]).toContain(r.status);
    const token = r.body.tokens.accessToken as string;
    expect((await call('POST', '/accounts/seed-defaults', {}, token)).status).toBe(201);
    const accounts = rows(await call('GET', '/accounts?limit=500', undefined, token));
    return { token, chart: new Map<string, string>(accounts.map((a: any) => [a.code, a.id])) };
  })();
  return tenantP;
}

test(
  '@issue-153 AC1: the demo accountant signs in through the form and reaches the dashboard; a wrong password is refused',
  { tags: ['feat:mz-auth', 'lvl:ui'] },
  async ({ app, screen, browser }) => {
    const bad = await call('POST', '/auth/login', {
      email: ADMIN.email,
      password: 'not-the-password-1',
    });
    expect(bad.status).toBe(401);
    // next dev compiles on the first hit and a submit before hydration is a plain GET: retry the form like the hub suite does
    for (let i = 0; i < 3; i++) {
      await app.open('/en/login');
      await expect(screen.getByRole('button', 'Sign In')).toBeVisible({ timeout: 60_000 });
      await screen.getByRole('textbox', 'Email').fill(ADMIN.email);
      await screen.getByRole('textbox', 'Password').fill(ADMIN.password);
      await screen.getByRole('button', 'Sign In').tap();
      try {
        await expect(browser).toHaveURL(/\/en\/dashboard/, { timeout: 45_000 });
        break;
      } catch (e) {
        if (i === 2) throw e;
      }
    }
    await expect(screen.getByRole('heading', 'Dashboard', { level: 1 })).toBeVisible({
      timeout: 90_000,
    });
  },
);

test(
  '@issue-153 AC2: a balanced ledger entry posts with equal decimal totals and an unbalanced one is rejected',
  { tags: ['feat:mz-journals', 'lvl:api'] },
  async () => {
    const { token, chart } = await tenant();
    const supplies = chart.get('6600')!,
      cash = chart.get('1000')!;
    expect(supplies && cash).toBeTruthy();
    const lines = (debit: string, credit: string) => [
      { accountId: supplies, debit, description: 'army-153 debit' },
      { accountId: cash, credit },
    ];
    const ok = await call(
      'POST',
      '/journals',
      { date: '2026-03-10', reference: 'army-153-balanced', lines: lines('50.25', '50.25') },
      token,
    );
    expect(ok.status).toBe(201);
    expect(ok.body.journalNumber).toMatch(/^JRN-\d+$/);
    expect([ok.body.totalDebit, ok.body.totalCredit]).toEqual(['50.2500', '50.2500']);
    const unbalanced = await call(
      'POST',
      '/journals',
      { date: '2026-03-10', reference: 'army-153-unbalanced', lines: lines('50', '49.99') },
      token,
    );
    expect(unbalanced.status).toBe(400);
    expect((await call('GET', '/journals')).status).toBe(401);
  },
);

test(
  '@issue-153 AC3: a sales invoice is created as a draft with exact totals and listed; an invoice without lines is rejected',
  { tags: ['feat:mz-sales-invoices', 'lvl:api'] },
  async () => {
    const { token } = await tenant();
    const customer = await call(
      'POST',
      '/customers',
      { name: 'army-153 customer', currency: 'EGP' },
      token,
    );
    expect(customer.status).toBe(201);
    const body = (lines: unknown[]) => ({
      customerId: customer.body.id,
      date: '2026-03-10',
      dueDate: '2099-12-31',
      lines,
    });
    const inv = await call(
      'POST',
      '/invoices',
      body([{ description: 'Consulting', quantity: '2', rate: '100', taxRate: '14' }]),
      token,
    );
    expect(inv.status).toBe(201);
    expect(inv.body.status).toBe('DRAFT');
    expect(inv.body.invoiceNumber).toMatch(/^INV-\d+$/);
    expect([inv.body.subtotal, inv.body.taxAmount, inv.body.grandTotal].map(dec)).toEqual([
      '200',
      '28',
      '228',
    ]); // 2 x 100 + 14% VAT
    expect(
      rows(await call('GET', '/invoices?limit=100', undefined, token)).map((x: any) => x.id),
    ).toContain(inv.body.id);
    expect((await call('POST', '/invoices', body([]), token)).status).toBe(400);
  },
);

test(
  '@issue-153 AC4: Arabic pages render right-to-left with Arabic text, English pages left-to-right',
  { tags: ['feat:mz-i18n-rtl', 'lvl:ui'] },
  async ({ app, screen, browser }) => {
    await app.open('/ar/login');
    await expect(screen.getByRole('heading', 'تسجيل الدخول')).toBeVisible({ timeout: 60_000 });
    await expect.poll(() => browser.evaluate(() => document.documentElement.dir)).toBe('rtl');
    await expect.poll(() => browser.evaluate(() => document.documentElement.lang)).toBe('ar');
    await app.open('/en/login');
    await expect(screen.getByRole('heading', 'Sign In')).toBeVisible({ timeout: 60_000 });
    await expect.poll(() => browser.evaluate(() => document.documentElement.dir)).toBe('ltr');
  },
);
