import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

const ADMIN = { email: 'admin@mizano.com', password: 'password123' };
const TAGS = ['feat:mz-vat-returns', 'lvl:api'];

function apiBase(baseUrl: string): string {
  return (process.env.E2E_ARMY_API ?? new URL('/api', baseUrl).toString()).replace(/\/+$/, '');
}

function unwrap<T>(body: unknown): T {
  const b = body as { data?: T; tokens?: { accessToken?: string } };
  if (b && typeof b === 'object') {
    if ('data' in b && b.data !== undefined) return b.data as T;
  }
  return body as T;
}

async function signIn(api: string): Promise<Record<string, string>> {
  const res = await fetch(`${api}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(ADMIN),
  });
  expect(res.status).toBeLessThan(300);
  const json = (await res.json()) as { tokens?: { accessToken?: string }; accessToken?: string };
  const token = json.tokens?.accessToken ?? json.accessToken ?? '';
  return { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
}

test(
  '@issue-348 AC1: VAT return draft requires authentication and returns draft totals',
  { tags: TAGS },
  async ({ app }) => {
    const api = apiBase(String(app.baseUrl));

    // Anonymous request returns 401
    const anonRes = await fetch(`${api}/tax/vat-returns/draft?periodStart=2026-01-01&periodEnd=2026-01-31`);
    expect(anonRes.status).toBe(401);

    // Authenticated request returns 200 with required draft fields
    const headers = await signIn(api);
    const res = await fetch(
      `${api}/tax/vat-returns/draft?periodStart=2026-01-01&periodEnd=2026-01-31`,
      { headers },
    );
    expect(res.status).toBe(200);
    const body = unwrap<Record<string, unknown>>(await res.json());
    expect(body.label).toBe('DRAFT, not for filing');
    expect(body.currency).toEqual(expect.stringMatching(/^[A-Z]{3}$/));
    for (const key of ['outputVat', 'inputVat', 'netVat', 'totalSales', 'totalPurchases']) {
      expect(body[key]).toEqual(expect.stringMatching(/^-?\d+\.\d{4}$/));
    }
    expect(Array.isArray(body.mismatches)).toBe(true);
    expect(Array.isArray(body.exceptions)).toBe(true);
    expect(Array.isArray(body.etaMismatches)).toBe(true);
  },
);

test(
  '@issue-348 AC2: invalid query parameters return HTTP 400',
  { tags: TAGS },
  async ({ app }) => {
    const api = apiBase(String(app.baseUrl));
    const headers = await signIn(api);

    // Missing parameters
    const missingBoth = await fetch(`${api}/tax/vat-returns/draft`, { headers });
    expect(missingBoth.status).toBe(400);

    const missingEnd = await fetch(
      `${api}/tax/vat-returns/draft?periodStart=2026-01-01`,
      { headers },
    );
    expect(missingEnd.status).toBe(400);

    // periodStart > periodEnd
    const invalidOrder = await fetch(
      `${api}/tax/vat-returns/draft?periodStart=2026-02-01&periodEnd=2026-01-01`,
      { headers },
    );
    expect(invalidOrder.status).toBe(400);

    // Range > 366 days
    const rangeTooLong = await fetch(
      `${api}/tax/vat-returns/draft?periodStart=2025-01-01&periodEnd=2026-01-03`,
      { headers },
    );
    expect(rangeTooLong.status).toBe(400);
  },
);
