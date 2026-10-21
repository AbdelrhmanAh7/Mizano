import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

const ADMIN = { email: 'admin@mizano.com', password: 'password123' };
const FOREIGN_ACCOUNT_ID = 'army-223-foreign-account';

function apiBase(baseUrl: string): string {
  const raw = process.env.E2E_ARMY_API ?? process.env.E2E_ARMY_URL ?? baseUrl;
  return /\/api$/.test(raw) ? raw : `${raw.replace(/\/+$/, '')}/api`;
}

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
  const data = (await res.json()) as { tokens?: { accessToken?: string }; accessToken?: string };
  const token = data.tokens?.accessToken ?? data.accessToken;
  return { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
}

test(
  '@issue-223 AC1: general ledger returns 200 and ledger entries for an owned account',
  { tags: ['feat:mz-general-ledger', 'feat:mz-financial-reports', 'lvl:api'] },
  async ({ app }) => {
    const base = apiBase(String(app.baseUrl));
    const headers = await signIn(base);

    const tbRes = await fetch(`${base}/reports/trial-balance`, { headers });
    expect(tbRes.status).toBe(200);
    const tb = unwrap<{ accounts: Array<{ accountId: string }> }>(await tbRes.json());
    if (tb.accounts && tb.accounts.length > 0) {
      const accountId = tb.accounts[0].accountId;
      const res = await fetch(`${base}/reports/general-ledger/${accountId}`, { headers });
      expect(res.status).toBe(200);
      const data = unwrap<{ entries: unknown[]; account: { id: string } }>(await res.json());
      expect(Array.isArray(data.entries)).toBe(true);
      expect(data.account.id).toBe(accountId);
    }
  },
);

test(
  '@issue-223 AC2: general ledger returns 404 for a foreign or non-existent account id',
  { tags: ['feat:mz-general-ledger', 'feat:mz-financial-reports', 'lvl:api'] },
  async ({ app }) => {
    const base = apiBase(String(app.baseUrl));
    const headers = await signIn(base);

    const res = await fetch(`${base}/reports/general-ledger/${FOREIGN_ACCOUNT_ID}`, { headers });
    expect(res.status).toBe(404);
  },
);

for (const token of ['', 'invalid.jwt.token']) {
  test(
    `@issue-223 AC3: general ledger by id rejects ${token ? 'a malformed' : 'a missing'} token with 401`,
    { tags: ['feat:mz-general-ledger', 'feat:mz-financial-reports', 'lvl:api'] },
    async ({ app }) => {
      const base = apiBase(String(app.baseUrl));
      const res = await fetch(`${base}/reports/general-ledger/${FOREIGN_ACCOUNT_ID}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      expect(res.status).toBe(401);
    },
  );
}
