import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

// Request-level test on a fresh tenant: bulk completion must run the same completeWorkOrder command as the
// single route (materials out, finished goods in, COGM journal), default quantityProduced to the planned
// quantity, and report { processed, total, failures } per order.
const SEED = 'army-165';
const TENANT = { email: `${SEED}@army-e2e.test`, password: 'ArmyE2e2026x' };
const WO = '/manufacturing/work-orders';

interface Res {
  status: number;
  body: any;
}

function apiBase(baseUrl: string): string {
  return (process.env.E2E_ARMY_API ?? new URL('/api', baseUrl).toString()).replace(/\/+$/, '');
}

function client(api: string, token?: string) {
  const once = async (method: string, path: string, body?: unknown): Promise<Res> => {
    const headers: Record<string, string> = { accept: 'application/json' };
    if (token) headers.authorization = `Bearer ${token}`;
    if (body !== undefined) headers['content-type'] = 'application/json';
    const res = await fetch(`${api}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let parsed: any = text;
    try {
      parsed = JSON.parse(text);
    } catch {
      /* keep text */
    }
    return { status: res.status, body: parsed };
  };
  // Auth routes are throttled (5 / 60 s): wait a 429 out instead of failing.
  const request = async (method: string, path: string, body?: unknown): Promise<Res> => {
    let res = await once(method, path, body);
    if (res.status === 429) {
      await expect
        .poll(async () => (res = await once(method, path, body)).status, {
          timeout: 85_000,
          interval: 5_000,
        })
        .not.toBe(429);
    }
    return res;
  };
  return {
    get: (path: string) => request('GET', path),
    post: (path: string, body: unknown = {}) => request('POST', path, body),
  };
}

const rows = (r: Res): any[] =>
  Array.isArray(r.body) ? r.body : Array.isArray(r.body?.data) ? r.body.data : [];
const lineSig = (journal: any): string[] =>
  (journal.lines ?? [])
    .map((l: any) => `${l.accountId}|${Number(l.debit).toFixed(4)}|${Number(l.credit).toFixed(4)}`)
    .sort();

test(
  '@issue-165 AC1 AC2 AC3: bulk completing work orders posts the same COGM journals as one by one and reports failures per order',
  { tags: ['feat:mz-work-orders', 'lvl:api'], timeout: 240_000 },
  async ({ app }) => {
    const base = apiBase(String(app.baseUrl));
    const anon = client(base);
    let auth = await anon.post('/auth/register', {
      ...TENANT,
      firstName: 'E2E',
      lastName: 'Bulk',
      organizationName: `${SEED} Manufacturing`,
    });
    if (auth.status === 409) auth = await anon.post('/auth/login', TENANT);
    expect([200, 201]).toContain(auth.status);
    const a = client(base, auth.body.tokens.accessToken);

    // Inventory account, default warehouse and a stocked component (cost 10, 2 per output unit).
    const inventory = await a.post('/accounts', {
      code: '1490',
      name: 'E2E Inventory',
      type: 'ASSET',
    });
    expect(inventory.status).toBe(201);
    const shrink = await a.post('/accounts', {
      code: '6790',
      name: 'E2E Shrinkage',
      type: 'EXPENSE',
    });
    expect(shrink.status).toBe(201);
    const wh = await a.post('/warehouses', {
      code: 'WH165',
      name: `${SEED} default`,
      isDefault: true,
    });
    expect(wh.status).toBe(201);
    const item = async (tag: string, costPrice: string) => {
      const r = await a.post('/items', {
        name: `${SEED} ${tag}`,
        sku: `${SEED}-${tag}`.toUpperCase(),
        type: 'GOODS',
        sellingPrice: '50.00',
        costPrice,
        inventoryAccountId: inventory.body.id,
      });
      expect(r.status).toBe(201);
      return r.body.id as string;
    };
    const component = await item('component', '10.00');
    const output = await item('output', '0');
    const stocked = await a.post('/inventory-adjustments', {
      date: '2026-03-10',
      warehouseId: wh.body.id,
      itemId: component,
      type: 'INCREASE',
      quantity: 30,
      reason: 'STOCKTAKE',
      accountId: shrink.body.id,
    });
    expect(stocked.status).toBe(201);
    const bom = await a.post('/manufacturing/bom', {
      name: `${SEED} BOM`,
      outputItemId: output,
      outputQuantity: 1,
      operationsCost: '0',
      components: [{ itemId: component, quantity: 2 }],
    });
    expect(bom.status).toBe(201);

    const workOrder = async (quantity: number, start: boolean) => {
      const r = await a.post(WO, { bomId: bom.body.id, quantity });
      expect(r.status).toBe(201);
      if (start) expect((await a.post(`${WO}/${r.body.id}/start`)).status).toBe(201);
      return r.body.id as string;
    };
    const [single, bulkA, bulkB, later] = [
      await workOrder(3, true),
      await workOrder(3, true),
      await workOrder(3, true),
      await workOrder(3, true),
    ];
    const draft = await workOrder(1, false);

    // One by one (the reference), then two orders in bulk without a quantity.
    expect((await a.post(`${WO}/${single}/complete`, { quantityProduced: 3 })).status).toBe(201);
    const bulk = await a.post(`${WO}/bulk-complete`, { ids: [bulkA, bulkB] });
    expect(bulk.status).toBe(201);
    expect(bulk.body).toEqual({ processed: 2, total: 2, failures: [] });

    // AC1: every completed order has a COGM journal with the same lines as the single completion.
    const journalLines = async (id: string) => {
      const wo = await a.get(`${WO}/${id}`);
      expect(wo.body.status).toBe('COMPLETED');
      expect(wo.body.journalId).toBeTruthy();
      const journal = await a.get(`/journals/${wo.body.journalId}`);
      expect(journal.status).toBe(200);
      return lineSig(journal.body);
    };
    // Reference: finished goods (the output item's inventory account) debited 3 x 2 x 10 = 60, raw materials credited 60.
    const reference = await journalLines(single);
    expect(reference).toHaveLength(2);
    expect(reference).toContain(`${inventory.body.id}|60.0000|0.0000`);
    expect(reference.some((sig) => sig.endsWith('|0.0000|60.0000'))).toBe(true);
    expect(await journalLines(bulkA)).toEqual(reference);
    expect(await journalLines(bulkB)).toEqual(reference);

    // AC2: per-order failures; only the startable order is processed; re-running a completed order is refused.
    const mixed = await a.post(`${WO}/bulk-complete`, {
      ids: [later, draft, `${SEED}-ghost`, bulkA],
    });
    expect(mixed.status).toBe(201);
    expect(mixed.body.processed).toBe(1);
    expect(mixed.body.total).toBe(4);
    expect(mixed.body.failures.map((f: { id: string }) => f.id).sort()).toEqual(
      [draft, `${SEED}-ghost`, bulkA].sort(),
    );
    expect((await a.get(`${WO}/${draft}`)).body.status).toBe('DRAFT');

    // Empty selection is rejected by validation.
    expect((await a.post(`${WO}/bulk-complete`, { ids: [] })).status).toBe(400);

    // Planned quantity was produced: 4 orders x 3 units out, 4 x 3 x 2 components consumed.
    const levels = rows(await a.get(`/inventory-levels?warehouseId=${wh.body.id}`));
    const qty = (id: string) =>
      Number(levels.find((l: any) => l.itemId === id || l.item?.id === id)?.quantity ?? 0);
    expect(qty(output)).toBe(12);
    expect(qty(component)).toBe(6);

    // Trial balance still balances.
    const tb = (await a.get('/accounting-reports/trial-balance')).body;
    expect(tb.totals.totalDebits).toBe(tb.totals.totalCredits);
  },
);
