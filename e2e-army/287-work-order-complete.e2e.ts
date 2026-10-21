import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

const SEED = 'army-287';

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

async function getWarehouseId(api: string, headers: Record<string, string>): Promise<string> {
  const res = await fetch(`${api}/warehouses`, { headers });
  if (res.ok) {
    const json = (await res.json().catch(() => ({}))) as { data?: Array<{ id?: string }> } | Array<{ id?: string }>;
    const list = Array.isArray(json) ? json : (json.data ?? []);
    if (list.length > 0 && list[0]?.id) return list[0].id;
  }
  return post(api, '/warehouses', headers, { code: `${SEED}-WH`, name: `${SEED}-warehouse` });
}

async function getInventoryAccountId(api: string, headers: Record<string, string>): Promise<string> {
  const res = await fetch(`${api}/accounts?limit=500`, { headers });
  if (res.ok) {
    const json = (await res.json().catch(() => ({}))) as { data?: Array<{ id?: string; type?: string; name?: string }> };
    const list = json.data ?? [];
    const inv = list.find((a) => a.type === 'ASSET' || a.name?.toLowerCase().includes('inventory'));
    if (inv?.id) return inv.id;
    if (list.length > 0 && list[0]?.id) return list[0].id;
  }
  return post(api, '/accounts', headers, {
    code: `${SEED}-INV`,
    name: `${SEED}-inventory`,
    type: 'ASSET',
  });
}

async function getAdjustmentAccountId(api: string, headers: Record<string, string>): Promise<string> {
  const res = await fetch(`${api}/inventory-adjustments/account-options`, { headers });
  if (res.ok) {
    const json = (await res.json().catch(() => ({}))) as { data?: Array<{ id?: string }> } | Array<{ id?: string }>;
    const list = Array.isArray(json) ? json : (json.data ?? []);
    if (list.length > 0 && list[0]?.id) return list[0].id;
  }
  const accRes = await fetch(`${api}/accounts`, { headers });
  if (accRes.ok) {
    const json = (await accRes.json().catch(() => ({}))) as { data?: Array<{ id?: string }> } | Array<{ id?: string }>;
    const list = Array.isArray(json) ? json : (json.data ?? []);
    if (list.length > 0 && list[0]?.id) return list[0].id;
  }
  return post(api, '/accounts', headers, {
    code: `${SEED}-EXP`,
    name: `${SEED}-expense`,
    type: 'EXPENSE',
  });
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
  const loginData = (await login.json()) as { accessToken?: string; tokens?: { accessToken?: string } };
  const accessToken = loginData.tokens?.accessToken ?? loginData.accessToken;
  expect(accessToken, 'accessToken from POST /auth/login').toBeTruthy();
  const headers = { 'content-type': 'application/json', authorization: `Bearer ${accessToken}` };

  const inventoryAccountId = await getInventoryAccountId(api, headers);

  const item = (sku: string) => ({
    name: `${SEED}-${sku}`,
    sku: `${SEED}-${sku}`,
    type: 'GOODS',
    unit: 'PCS',
    sellingPrice: '10.00',
    costPrice: '5.00',
    inventoryAccountId,
  });
  const outputItemId = await post(api, '/items', headers, item('OUT'));
  const componentItemId = await post(api, '/items', headers, item('COMP'));

  // Ensure component has available stock for the BOM requirement (2 * 5 = 10 units)
  const warehouseId = await getWarehouseId(api, headers);
  const accountId = await getAdjustmentAccountId(api, headers);
  await post(api, '/inventory-adjustments', headers, {
    date: new Date().toISOString().slice(0, 10),
    warehouseId,
    itemId: componentItemId,
    type: 'INCREASE',
    quantity: 10,
    reason: 'STOCKTAKE',
    accountId,
  });

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
  '@issue-287 AC1 AC2: completing a started work order with a quantity from the UI succeeds (no 400)',
  { tags: ['feat:mz-work-orders', 'lvl:ui'] },
  async ({ app, agent }) => {
    const workOrderId = await createStartedWorkOrder(String(app.baseUrl));

    await app.open('/en/login');
    await agent.act('sign in as {email} with password {pw}', {
      params: { email: 'admin@mizano.com', pw: 'password123' },
    });
    await app.open(`/en/manufacturing/work-orders/${workOrderId}`);
    await agent.act(
      'click the Complete button and, in the dialog, set Quantity Produced to {qty}',
      {
        params: { qty: '0' },
      },
    );
    await agent.assert('the Complete Production button is disabled');
    await agent.act('set Quantity Produced to {qty}', {
      params: { qty: '5' },
    });
    await agent.act('click Complete Production');
    await agent.assert(
      'the work order is completed and no error toast about a failed request appears',
    );

    // Arabic page of the same work order renders right-to-left.
    await app.open(`/ar/manufacturing/work-orders/${workOrderId}`);
    await agent.assert('the page layout is right-to-left');
  },
);
