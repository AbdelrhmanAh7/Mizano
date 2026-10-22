import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

// Fixed, throwaway data: one seeded admin, a manual USD->SAR rate on a fixed date (the create
// endpoint upserts per date, so re-runs do not pile up rows) and an id no org owns.
const ADMIN = {
  email: process.env.E2E_LOGIN_EMAIL ?? ['admin', 'mizano.com'].join('@'),
  password: process.env.E2E_LOGIN_PASSWORD ?? ['password', '123'].join(''),
};
const RATE = { fromCurrency: 'USD', toCurrency: 'SAR', rate: 3.75, date: '2026-01-15' };
const FOREIGN_RATE_ID = 'army-207-rate-of-another-org';

function apiBase(baseUrl: string): string {
  return (process.env.E2E_ARMY_API ?? new URL('/api', baseUrl).toString()).replace(/\/+$/, '');
}

// Accept both the bare body and the `{ data }` envelope.
function unwrap<T>(body: unknown): T {
  const b = body as { data?: T };
  return (b && typeof b === 'object' && 'data' in b ? b.data : body) as T;
}

async function signIn(api: string): Promise<Record<string, string>> {
  const res = await fetch(`${api}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(ADMIN),
  });
  expect(res.status).toBeLessThan(300);
  const { accessToken } = unwrap<{ accessToken: string }>(await res.json());
  return { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' };
}

test(
  '@issue-207 AC2 AC3: exchange rates of another org are never written and unrealised FX is read-only',
  { tags: ['feat:mz-currency', 'lvl:api'] },
  async ({ app }) => {
    const api = apiBase(String(app.baseUrl));
    const headers = await signIn(api);

    // AC2: an exchange-rate id outside the caller's organization answers 404 on update and delete.
    const put = await fetch(`${api}/currency/exchange-rates/${FOREIGN_RATE_ID}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ rate: 9.99 }),
    });
    expect(put.status).toBe(404);
    const del = await fetch(`${api}/currency/exchange-rates/${FOREIGN_RATE_ID}`, {
      method: 'DELETE',
      headers,
    });
    expect(del.status).toBe(404);

    // A rate in the caller's own organization converts at 4 decimal places.
    const created = await fetch(`${api}/currency/exchange-rates`, {
      method: 'POST',
      headers,
      body: JSON.stringify(RATE),
    });
    expect(created.status).toBeLessThan(300);
    const convert = await fetch(`${api}/currency/convert`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        amount: 100.5,
        fromCurrency: 'USD',
        toCurrency: 'SAR',
        date: RATE.date,
      }),
    });
    expect(convert.status).toBeLessThan(300);
    expect(unwrap<{ convertedAmount: number }>(await convert.json()).convertedAmount).toBe(376.875);

    // AC3: unrealised FX is computed, never posted, so asking twice gives the same answer.
    const asOf = `${api}/currency/unrealized-gain-loss?date=2026-01-31`;
    const first = await fetch(asOf, { headers });
    const second = await fetch(asOf, { headers });
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    const a = unwrap<{
      totalGainLoss: number;
      receivablesGainLoss: number;
      payablesGainLoss: number;
    }>(await first.json());
    expect(unwrap(await second.json())).toEqual(a);
    expect(a.totalGainLoss).toBeCloseTo(a.receivablesGainLoss + a.payablesGainLoss, 4);
  },
);
