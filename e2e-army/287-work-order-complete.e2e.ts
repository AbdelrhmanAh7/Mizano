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
        params: { qty: '5' },
      },
    );
    await agent.act('click Complete Production');
    await agent.assert(
      'the work order is completed and no error toast about a failed request appears',
    );

    // Arabic page of the same work order renders right-to-left.
    await app.open(`/ar/manufacturing/work-orders/${workOrderId}`);
    await agent.assert('the page layout is right-to-left');
  },
);
