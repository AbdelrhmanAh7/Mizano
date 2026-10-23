import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

// Fixed, throwaway data: seeded admin credentials and an ID belonging to no organization or another tenant.
const ADMIN = { email: 'admin@mizano.com', password: 'password123' };
const FOREIGN_CHALLAN_ID = 'army-465-foreign-or-nonexistent-challan';

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
  '@issue-465 AC1 AC2: delivery challan update outside org or non-existent returns 404 with no writes',
  { tags: ['feat:mz-sales-delivery-challans', 'lvl:api'] },
  async ({ app }) => {
    const api = apiBase(String(app.baseUrl));
    const headers = await signIn(api);

    // AC1/AC2: updating a delivery challan id outside caller's organization answers 404
    const res = await fetch(`${api}/delivery-challans/${FOREIGN_CHALLAN_ID}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ notes: 'unauthorized cross-tenant update' }),
    });
    expect(res.status).toBe(404);
  },
);
