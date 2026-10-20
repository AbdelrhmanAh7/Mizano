import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

// Covers financial reports, dashboard, and aging reports features.
const TAGS = ['feat:mz-financial-reports', 'feat:mz-dashboard', 'feat:mz-aging-reports'];

interface Reconciliation {
  asOf: string;
  currencyCode: string;
  subledgerTotal: string;
  controlBalance: string;
  difference: string;
  ok: boolean;
}

const apiRoot = (baseUrl: string): string =>
  (process.env.E2E_ARMY_API ?? new URL('/api', baseUrl).toString()).replace(/\/+$/, '');

// One login for the file: the auth route is throttled to a handful of attempts a minute.
// Test credentials default to demo admin fixtures, configurable via env vars.
let token: Promise<string> | undefined;
function login(root: string): Promise<string> {
  const email = process.env.E2E_EMAIL ?? 'admin@mizano.com';
  const password = process.env.E2E_PASSWORD ?? 'password123';
  token ??= fetch(`${root}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  }).then(async (res) => {
    expect(res.status).toBe(200);
    const body = (await res.json()) as { tokens: { accessToken: string } };
    return body.tokens.accessToken;
  });
  return token;
}

const cents = (value: string): bigint => BigInt(value.replace('.', ''));

async function reconcile(root: string, asOf: string): Promise<Reconciliation> {
  const res = await fetch(`${root}/reports/reconciliation/ap?asOf=${asOf}`, {
    headers: { authorization: `Bearer ${await login(root)}` },
  });
  expect(res.status).toBe(200);
  return (await res.json()) as Reconciliation;
}

test(
  '@issue-125 AC5: before any posting both sides are zero and the report reconciles',
  { tags: TAGS },
  async ({ app }) => {
    const result = await reconcile(apiRoot(app.baseUrl), '1990-01-01');
    expect(result).toEqual({
      asOf: '1990-01-01',
      currencyCode: expect.stringMatching(/^[A-Z]{3}$/),
      subledgerTotal: '0.0000',
      controlBalance: '0.0000',
      difference: '0.0000',
      ok: true,
    });
  },
);

test(
  '@issue-125 AC1/AC2: difference is exactly subledger minus control and ok follows it',
  { tags: TAGS },
  async ({ app }) => {
    const root = apiRoot(app.baseUrl);
    const first = await reconcile(root, '2099-12-31');
    expect(cents(first.difference)).toBe(cents(first.subledgerTotal) - cents(first.controlBalance));
    expect(first.ok).toBe(cents(first.difference) === BigInt(0));
    // Read-only: a second call returns the same figures.
    expect(await reconcile(root, '2099-12-31')).toEqual(first);
  },
);

test(
  '@issue-125 AC4: an invalid asOf is a 400 and an anonymous call is a 401',
  { tags: TAGS },
  async ({ app }) => {
    const root = apiRoot(app.baseUrl);
    const bad = await fetch(`${root}/reports/reconciliation/ap?asOf=2026-02-30`, {
      headers: { authorization: `Bearer ${await login(root)}` },
    });
    expect(bad.status).toBe(400);
    const anonymous = await fetch(`${root}/reports/reconciliation/ap?asOf=2026-03-31`);
    expect(anonymous.status).toBe(401);
  },
);
