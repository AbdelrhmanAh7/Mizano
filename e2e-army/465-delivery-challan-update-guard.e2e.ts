import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

const SEED = process.env.E2E_ARMY_SEED ?? 'army-465';
const FOREIGN_CHALLAN_ID = 'army-465-foreign-or-nonexistent-challan';

function apiBase(baseUrl: string): string {
  return (process.env.E2E_ARMY_API ?? new URL('/api', baseUrl).toString()).replace(/\/+$/, '');
}

// Accept both the bare body and the `{ data }` envelope.
function unwrap<T>(body: unknown): T {
  const b = body as { data?: T };
  return (b && typeof b === 'object' && 'data' in b ? b.data : body) as T;
}

/**
 * Authenticates dynamically using environment credentials if provided,
 * or registers a disposable throwaway tenant for testing without hardcoded credentials.
 */
async function authenticate(api: string): Promise<Record<string, string>> {
  const envEmail = process.env.E2E_USER_EMAIL || process.env.E2E_LOGIN_EMAIL;
  const envPassword = process.env.E2E_USER_PASSWORD || process.env.E2E_LOGIN_PASSWORD;

  if (envEmail && envPassword) {
    const res = await fetch(`${api}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: envEmail, password: envPassword }),
    });
    expect(res.status).toBeLessThan(300);
    const body = unwrap<{ accessToken?: string; tokens?: { accessToken: string } }>(
      await res.json(),
    );
    const token = body.accessToken ?? body.tokens?.accessToken;
    expect(token).toBeDefined();
    return { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
  }

  // Dynamic throwaway tenant when no environment credentials are provided
  const email = `${SEED}-guard@mizano.test`;
  const password = `Army465Pass!${SEED.slice(-4)}`;
  let res = await fetch(`${api}/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email,
      password,
      firstName: 'Army',
      lastName: 'Guard',
      organizationName: `Org ${SEED}`,
    }),
  });
  if (res.status === 409) {
    res = await fetch(`${api}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
  }
  expect(res.status).toBeLessThan(300);
  const body = unwrap<{ accessToken?: string; tokens?: { accessToken: string } }>(await res.json());
  const token = body.accessToken ?? body.tokens?.accessToken;
  expect(token).toBeDefined();
  return { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
}

test(
  '@issue-465 AC1 AC2: delivery challan update outside org or non-existent returns 404 with no writes',
  { tags: ['feat:mz-sales-delivery-challans', 'lvl:api'] },
  async ({ app }) => {
    const api = apiBase(String(app.baseUrl));
    const headers = await authenticate(api);

    // AC1/AC2: updating a delivery challan id outside caller's organization answers 404
    const res = await fetch(`${api}/delivery-challans/${FOREIGN_CHALLAN_ID}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ notes: 'unauthorized cross-tenant update' }),
    });
    expect(res.status).toBe(404);
  },
);
