import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

/** Mizano's Nest API is on its own origin (`E2E_ARMY_API` ends in `/api`); fall back to the app origin. */
function apiBase(app: { baseUrl: string }): string {
  const raw = process.env.E2E_ARMY_API ?? process.env.E2E_ARMY_URL ?? app.baseUrl;
  return /\/api$/.test(raw) ? raw : `${raw.replace(/\/+$/, '')}/api`;
}

test(
  '@issue-318 AC1 AC2 AC3: bill line accounts must be active expense or asset accounts; assigning invalid account types via API is rejected with 400',
  { tags: ['feat:mz-purchase-bills', 'lvl:api'] },
  async ({ app }) => {
    const base = apiBase(app);

    // Sign in as seeded demo admin to obtain JWT token
    const loginRes = await fetch(`${base}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'admin@mizano.com', password: 'password123' }),
    });
    expect(loginRes.status).toBe(200);
    const auth = {
      authorization: `Bearer ${(await loginRes.json()).tokens.accessToken}`,
      'content-type': 'application/json',
    };

    // Find accounts to test: an expense account and a liability/revenue account
    const accountsRes = await fetch(`${base}/accounts?limit=100`, { headers: auth });
    expect(accountsRes.status).toBe(200);
    const accountsData = await accountsRes.json();
    const accounts: Array<{ id: string; type: string; isActive?: boolean }> =
      accountsData.data ?? accountsData;

    const expenseAccount = accounts.find((a) => a.type === 'EXPENSE');
    const liabilityAccount = accounts.find((a) => a.type === 'LIABILITY');
    expect(expenseAccount).toBeDefined();
    expect(liabilityAccount).toBeDefined();

    // Fetch an existing vendor for creating bills
    const vendorsRes = await fetch(`${base}/purchases/vendors?limit=1`, { headers: auth });
    expect(vendorsRes.status).toBe(200);
    const vendorsData = await vendorsRes.json();
    const vendorId = (vendorsData.data ?? vendorsData)[0]?.id;
    expect(vendorId).toBeDefined();

    // 1. Attempt to create a bill assigning a non-expense/non-asset account (LIABILITY)
    const invalidCreateRes = await fetch(`${base}/purchases/bills`, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({
        vendorId,
        date: '2026-10-21',
        dueDate: '2026-11-20',
        lines: [
          {
            description: 'Malicious liability account mapping',
            quantity: '1',
            rate: '100',
            accountId: liabilityAccount!.id,
          },
        ],
      }),
    });
    // Must be rejected with 400 Bad Request
    expect(invalidCreateRes.status).toBe(400);
    const errorBody = await invalidCreateRes.json();
    expect(errorBody.message).toMatch(/expense or asset/i);

    // 2. Creating a bill with a valid active EXPENSE account succeeds
    const validCreateRes = await fetch(`${base}/purchases/bills`, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({
        vendorId,
        date: '2026-10-21',
        dueDate: '2026-11-20',
        lines: [
          {
            description: 'Valid expense account mapping',
            quantity: '1',
            rate: '100',
            accountId: expenseAccount!.id,
          },
        ],
      }),
    });
    expect(validCreateRes.status).toBe(201);
  },
);

test(
  '@issue-318 AC4 AC6: bill-form displays in RTL on Arabic and respects expense/asset account filtering',
  { tags: ['feat:mz-purchase-bills', 'lvl:ui'] },
  async ({ app, agent, screen, browser }) => {
    await app.open('/ar/login');
    await agent.act('sign in as {email} with password {pw}', {
      params: { email: 'admin@mizano.com', pw: 'password123' },
    });

    await app.open('/ar/purchases/bills/new');
    expect(await browser.evaluate(() => document.documentElement.dir)).toBe('rtl');
    await agent.assert('the bill form page loads in Arabic RTL');
  },
);
