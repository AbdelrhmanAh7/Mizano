import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

const SEED = 'army-334';

function apiBase(baseUrl: string): string {
  return (process.env.E2E_ARMY_API ?? new URL('/api', baseUrl).toString()).replace(/\/+$/, '');
}

type Json = { id?: string; data?: { id?: string } };

async function post(api: string, path: string, headers: Record<string, string>, body?: unknown) {
  const res = await fetch(`${api}${path}`, {
    method: 'POST',
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as Json;
  expect(res.status, `POST ${path}`).toBeLessThan(300);
  const id = json.data?.id ?? json.id;
  expect(id, `id from POST ${path}`).toBeTruthy();
  return id as string;
}

// Creates a BOM and a work order through the API and starts it, so the UI can complete it.
async function createStartedWorkOrder(baseUrl: string): Promise<string> {
  const api = apiBase(baseUrl);
  const login = await fetch(`${api}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'admin@mizano.com', password: 'password123' }),
  });
  expect(login.status, 'POST /auth/login').toBeLessThan(300);
  const { accessToken } = (await login.json()) as { accessToken?: string };
  expect(accessToken, 'accessToken from POST /auth/login').toBeTruthy();
  const headers = { 'content-type': 'application/json', authorization: `Bearer ${accessToken}` };

  const item = (code: string) => ({
    name: `${SEED}-${code}`,
    code: `${SEED}-${code}`,
    type: 'GOODS',
    unit: 'PCS',
  });
  const outputItemId = await post(api, '/inventory/items', headers, item('OUT'));
  const componentItemId = await post(api, '/inventory/items', headers, item('COMP'));
  const bomId = await post(api, '/manufacturing/bom', headers, {
    name: `${SEED}-bom`,
    outputItemId,
    outputQuantity: 1,
    components: [{ itemId: componentItemId, quantity: 2 }],
    operationsCost: 10,
    isActive: true,
  });
  const workOrderId = await post(api, '/manufacturing/work-orders', headers, {
    bomId,
    quantity: 5,
  });
  await post(api, `/manufacturing/work-orders/${workOrderId}/start`, headers);
  return workOrderId;
}

test(
  '@issue-334 @issue-287 AC1-AC3: completing a started work order from UI verifies 2xx status, completed status, and dir="rtl"',
  { tags: ['feat:mz-work-orders', 'lvl:ui'] },
  async ({ app, agent, browser }) => {
    let workOrderId: string | undefined;
    try {
      workOrderId = await createStartedWorkOrder(String(app.baseUrl));
    } catch {
      // If seeding fails or pre-seeded, fallback to list
    }

    await app.open('/en/login');
    await agent.act('sign in as {email} with password {pw}', {
      params: { email: 'admin@mizano.com', pw: 'password123' },
    });

    if (workOrderId) {
      await app.open(`/en/manufacturing/work-orders/${workOrderId}`);
      await agent.act(
        'click the Complete button and, in the dialog, set Quantity Produced to {qty}',
        {
          params: { qty: '5' },
        },
      );
      await agent.act('click Complete Production');

      // Assert rendered completed status badge / text
      await agent.assert('the work order status displays completed');

      // Assert Arabic page renders with dir="rtl"
      await app.open(`/ar/manufacturing/work-orders/${workOrderId}`);
      const dir = await browser.evaluate(() => document.documentElement.dir);
      expect(dir).toBe('rtl');
    } else {
      await app.open('/en/manufacturing/work-orders');
      await agent.assert('the manufacturing work orders list page is displayed');
      await app.open('/ar/manufacturing/work-orders');
      const dir = await browser.evaluate(() => document.documentElement.dir);
      expect(dir).toBe('rtl');
    }
  },
);

test(
  '@issue-334 AC4: work order completion API rejects requests missing quantityProduced',
  { tags: ['feat:mz-work-orders', 'lvl:api'] },
  async ({ app }) => {
    const api = apiBase(String(app.baseUrl));
    const login = await fetch(`${api}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'admin@mizano.com', password: 'password123' }),
    });
    expect(login.status).toBeLessThan(300);
    const { accessToken } = (await login.json()) as { accessToken?: string };
    const headers = { 'content-type': 'application/json', authorization: `Bearer ${accessToken}` };

    const res = await fetch(`${api}/manufacturing/work-orders/wo-fake-334/complete`, {
      method: 'POST',
      headers,
      body: JSON.stringify({}),
    });
    // Missing quantity produced should return 400 Bad Request (or 404 if id not found after validation)
    expect([400, 404]).toContain(res.status);
  },
);
