import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

// The FIFO costing service backs GET /api/items/valuation and /api/items/:id/valuation.
// Request-level checks only (no model call): the gate runs them alone for backend-only changes.
const ADMIN = { email: 'admin@mizano.com', password: 'password123' };
const FOREIGN_ITEM_ID = 'army-206-item-of-another-org';

function apiBase(baseUrl: string): string {
  return (process.env.E2E_ARMY_API ?? new URL('/api', baseUrl).toString()).replace(/\/+$/, '');
}

async function signIn(api: string): Promise<string> {
  const res = await fetch(`${api}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(ADMIN),
  });
  expect(res.status).toBe(200);
  const body = (await res.json()) as { tokens: { accessToken: string } };
  return body.tokens.accessToken;
}

type Valuation = {
  totalValue: string | number;
  items: Array<{ itemId: string; totalQuantity: number; totalValue: number }>;
};

test(
  '@issue-206 AC1 AC2: FIFO valuation sums only the signed-in organization cost layers',
  { tags: ['feat:mz-items', 'lvl:api'] },
  async ({ app }) => {
    const api = apiBase(String(app.baseUrl));
    const token = await signIn(api);
    const auth = { authorization: `Bearer ${token}` };

    const res = await fetch(`${api}/items/valuation`, { headers: auth });
    expect(res.status).toBe(200);
    const all = (await res.json()) as Valuation;
    expect(Number.isFinite(Number(all.totalValue))).toBe(true);
    expect(Number(all.totalValue)).toBeGreaterThanOrEqual(0);
    // The organization total is exactly the sum of its per-item totals.
    const sum = all.items.reduce((s, i) => s + i.totalValue, 0);
    expect(Math.abs(sum - Number(all.totalValue))).toBeLessThan(0.0001);

    // An item id this organization does not own yields no layers, not another tenant's stock.
    const foreign = await fetch(`${api}/items/${FOREIGN_ITEM_ID}/valuation`, { headers: auth });
    expect(foreign.status).toBe(200);
    const none = (await foreign.json()) as Valuation;
    expect(none.items).toEqual([]);
    expect(Number(none.totalValue)).toBe(0);
  },
);

test(
  '@issue-206 AC2: FIFO valuation without a session is rejected',
  { tags: ['feat:mz-items', 'lvl:api'] },
  async ({ app }) => {
    const api = apiBase(String(app.baseUrl));
    const res = await fetch(`${api}/items/valuation`);
    expect(res.status).toBe(401);
  },
);
