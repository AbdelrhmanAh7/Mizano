import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

const TAGS = ['feat:mz-vat-returns'];
const DRAFT_URL = '/api/reports/vat-return-draft';

async function signIn(baseUrl: string): Promise<string> {
  const res = await fetch(new URL('/api/auth/login', baseUrl), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@mizano.com', password: 'password123' }),
  });
  expect(res.status).toBeLessThan(300);
  const body = (await res.json()) as { tokens: { accessToken: string } };
  return body.tokens.accessToken;
}

async function draft(
  baseUrl: string,
  token: string | null,
  from: string,
  to: string,
): Promise<Response> {
  const url = new URL(DRAFT_URL, baseUrl);
  url.searchParams.set('from', from);
  url.searchParams.set('to', to);
  return fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
}

test(
  '@issue-114 AC1: the VAT return draft needs a signed-in user',
  { tags: TAGS },
  async ({ app }) => {
    const res = await draft(app.baseUrl, null, '2026-01-01', '2026-01-31');
    expect(res.status).toBe(401);
  },
);

test(
  '@issue-114 AC2: a period returns a labelled draft with decimal-string totals, currency and the pre-filing checks',
  { tags: TAGS },
  async ({ app }) => {
    const token = await signIn(app.baseUrl);
    const res = await draft(app.baseUrl, token, '2026-01-01', '2026-01-31');
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.label).toBe('DRAFT, not for filing');
    expect(body.currency).toEqual(expect.stringMatching(/^[A-Z]{3}$/));
    for (const key of ['outputTax', 'inputTax', 'netPayable', 'outputVat', 'inputVat', 'netVat', 'totalSales', 'totalPurchases']) {
      expect(body[key]).toEqual(expect.stringMatching(/^-?\d+\.\d{4}$/));
    }
    expect(Array.isArray(body.exceptions)).toBe(true);
    expect(Array.isArray(body.etaMismatches)).toBe(true);
    expect(Array.isArray(body.mismatches)).toBe(true);
  },
);

test(
  '@issue-114 AC1: GET /tax/vat-returns/draft returns 200 with draft figures and mismatches',
  { tags: TAGS },
  async ({ app }) => {
    const token = await signIn(app.baseUrl);
    const url = new URL('/api/tax/vat-returns/draft', app.baseUrl);
    url.searchParams.set('periodStart', '2026-01-01');
    url.searchParams.set('periodEnd', '2026-01-31');
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    for (const key of ['outputVat', 'inputVat', 'netVat', 'totalSales', 'totalPurchases']) {
      expect(body[key]).toEqual(expect.stringMatching(/^-?\d+\.\d{4}$/));
    }
    expect(Array.isArray(body.mismatches)).toBe(true);
  },
);


test(
  '@issue-114 AC3: a date-only end date covers the whole day',
  { tags: TAGS },
  async ({ app }) => {
    const token = await signIn(app.baseUrl);
    const res = await draft(app.baseUrl, token, '2026-01-31', '2026-01-31');
    expect(res.status).toBe(200);
  },
);

test(
  '@issue-114 AC5: a start after the end is rejected with 400',
  { tags: TAGS },
  async ({ app }) => {
    const token = await signIn(app.baseUrl);
    const res = await draft(app.baseUrl, token, '2026-02-01', '2026-01-31');
    expect(res.status).toBe(400);
  },
);

test(
  '@issue-114 AC7: a period longer than 366 days is rejected with 400',
  { tags: TAGS },
  async ({ app }) => {
    const token = await signIn(app.baseUrl);
    const tooLong = await draft(app.baseUrl, token, '2025-01-01', '2026-01-02');
    expect(tooLong.status).toBe(400);
    const maxLeapYear = await draft(app.baseUrl, token, '2024-01-01', '2024-12-31');
    expect(maxLeapYear.status).toBe(200);
  },
);
