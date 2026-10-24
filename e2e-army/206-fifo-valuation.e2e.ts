import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

// The FIFO costing service backs GET /api/items/valuation and /api/items/:id/valuation.
// Request-level checks only (no model call): the gate runs them alone for backend-only changes.
// The seeded demo admin owns opening cost layers (throwaway DB only); override with E2E_ARMY_EMAIL / E2E_ARMY_PASSWORD.
const ADMIN = {
  email: process.env.E2E_ARMY_EMAIL ?? 'admin@mizano.com',
  password: process.env.E2E_ARMY_PASSWORD ?? 'password123',
};
// A second, empty organization registered by the test: it owns no cost layers.
const ORG_B = {
  email: 'army-206-org-b@example.com',
  password: 'Army206Pass1',
  firstName: 'Army',
  lastName: 'Two',
  organizationName: 'Army 206 Org B',
};

function apiBase(baseUrl: string): string {
  return (process.env.E2E_ARMY_API ?? new URL('/api', baseUrl).toString()).replace(/\/+$/, '');
}

async function login(api: string, creds: { email: string; password: string }): Promise<Response> {
  return fetch(`${api}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(creds),
  });
}

async function signIn(api: string, creds = ADMIN): Promise<string> {
  const res = await login(api, creds);
  expect(res.status).toBe(200);
  const body = (await res.json()) as { tokens: { accessToken: string } };
  return body.tokens.accessToken;
}

// Registers organization B once; a rerun on the same throwaway DB just signs in.
async function signInOrgB(api: string): Promise<string> {
  const first = await login(api, ORG_B);
  if (first.status !== 200) {
    const reg = await fetch(`${api}/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(ORG_B),
    });
    expect(reg.status).toBeLessThan(300);
  }
  return signIn(api, ORG_B);
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

    // Organization B asks for organization A's stocked item by id: it sees no layers, not A's stock.
    const stocked = all.items.find((i) => i.totalQuantity > 0);
    expect(stocked).toBeDefined();
    const ownView = (await (
      await fetch(`${api}/items/${stocked!.itemId}/valuation`, { headers: auth })
    ).json()) as Valuation;
    expect(ownView.items.map((i) => i.itemId)).toEqual([stocked!.itemId]);

    const authB = { authorization: `Bearer ${await signInOrgB(api)}` };
    const foreign = await fetch(`${api}/items/${stocked!.itemId}/valuation`, { headers: authB });
    expect(foreign.status).toBe(200);
    const none = (await foreign.json()) as Valuation;
    expect(none.items).toEqual([]);
    expect(Number(none.totalValue)).toBe(0);

    const totalB = (await (
      await fetch(`${api}/items/valuation`, { headers: authB })
    ).json()) as Valuation;
    expect(Number(totalB.totalValue)).toBe(0);
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
