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
    const getOrCreateAccount = async (code: string, name: string, type: string) => {
      const res = await a.post('/accounts', { code, name, type });
      if (res.status === 201) return res.body.id as string;
      const list = rows(await a.get('/accounts'));
      const found = list.find((acc: any) => acc.code === code);
      if (found) return found.id as string;
      expect(res.status).toBe(201);
      return res.body.id as string;
    };
    const inventoryId = await getOrCreateAccount('1490', 'E2E Inventory', 'ASSET');
    const shrinkId = await getOrCreateAccount('6790', 'E2E Shrinkage', 'EXPENSE');

    const getOrCreateWarehouse = async (code: string, name: string) => {
      const res = await a.post('/warehouses', { code, name, isDefault: true });
      if (res.status === 201) return res.body.id as string;
      const list = rows(await a.get('/warehouses'));
      const found = list.find((w: any) => w.code === code);
      if (found) return found.id as string;
      expect(res.status).toBe(201);
      return res.body.id as string;
    };
    const whId = await getOrCreateWarehouse('WH165', `${SEED} default`);

    const getOrCreateItem = async (tag: string, costPrice: string) => {
      const sku = `${SEED}-${tag}`.toUpperCase();
      const res = await a.post('/items', {
        name: `${SEED} ${tag}`,
        sku,
        type: 'GOODS',
        sellingPrice: '50.00',
        costPrice,
        inventoryAccountId: inventoryId,
      });
      if (res.status === 201) return res.body.id as string;
      const list = rows(await a.get('/items'));
      const found = list.find((it: any) => it.sku === sku);
      if (found) return found.id as string;
      expect(res.status).toBe(201);
      return res.body.id as string;
    };
    const component = await getOrCreateItem('component', '10.00');
    const output = await getOrCreateItem('output', '0');

    // Ensure stocked components for production
    await a.post('/inventory-adjustments', {
      date: '2026-03-10',
      warehouseId: whId,
      itemId: component,
      type: 'INCREASE',
      quantity: 30,
      reason: 'STOCKTAKE',
      accountId: shrinkId,
    });

    const getOrCreateBom = async () => {
      const res = await a.post('/manufacturing/bom', {
        name: `${SEED} BOM`,
        outputItemId: output,
        outputQuantity: 1,
        operationsCost: '0',
        components: [{ itemId: component, quantity: 2 }],
      });
      if (res.status === 201) return res.body.id as string;
      const list = rows(await a.get('/manufacturing/bom'));
      const found = list.find((b: any) => b.outputItemId === output);
      if (found) return found.id as string;
      expect(res.status).toBe(201);
      return res.body.id as string;
    };
    const bomId = await getOrCreateBom();

    const workOrder = async (quantity: number, start: boolean) => {
      const r = await a.post(WO, { bomId, quantity });
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
    expect(reference).toContain(`${inventoryId}|60.0000|0.0000`);
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

    // Planned quantity was produced: 4 orders x 3 units in, 4 x 3 x 2 components out.
    const completedBatch = [single, bulkA, bulkB, later];
    const moves = rows(await a.get('/inventory-movements?type=production&limit=100'));
    const moved = (id: string, dir: string) =>
      moves
        .filter(
          (m: any) =>
            m.itemId === id &&
            m.movementType === dir &&
            (!m.referenceId || completedBatch.includes(m.referenceId)),
        )
        .reduce((sum: number, m: any) => sum + Number(m.quantity), 0);
    expect(moved(output, 'IN')).toBe(12);
    expect(moved(component, 'OUT')).toBe(24);

    // Trial balance still balances.
    const tb = (await a.get('/accounting-reports/trial-balance')).body;
    expect(tb.totals.totalDebits).toBe(tb.totals.totalCredits);
  },
);

// Seeded demo org: WO-001 and WO-002 are In Process. Select both in the list, press Complete, and each gets the
// COGM journal completeWorkOrder posts (planned quantity x component cost + operations cost); the trial balance balances.
test(
  '@issue-165 AC1 AC3: seeded demo, select WO-001 and WO-002, Complete posts a COGM journal for both',
  { tags: ['feat:mz-work-orders', 'lvl:ui'], timeout: 180_000 },
  async ({ app, screen, browser }) => {
    // Demo admin sign-in, retried like the hub suite: a submit before hydration is a plain GET.
    for (let i = 0; i < 3; i++) {
      await app.open('/en/login');
      await screen.getByRole('textbox', 'Email').fill('admin@mizano.com');
      await screen.getByRole('textbox', 'Password').fill('password123');
      await screen.getByRole('button', 'Sign In').tap();
      try {
        await expect(browser).toHaveURL(/\/en\/(dashboard|onboarding|accounting|sales)/, {
          timeout: 40_000,
        });
        break;
      } catch (e) {
        if (i === 2) throw e;
      }
    }
    await app.open('/en/manufacturing/work-orders');
    for (const number of ['WO-001', 'WO-002']) {
      const row = screen.getByRole('row').filter({ hasText: number });
      await expect(row).toContainText('In Process');
      await row.getByRole('checkbox', 'Select row').tap();
    }
    await screen.getByRole('button', 'Complete', { visible: true }).tap();
    await screen.getByRole('button', 'Complete 2 work orders').tap();
    await expect(screen.getByRole('alertdialog')).toBeHidden({ timeout: 30_000 });

    const api = client(apiBase(String(app.baseUrl)));
    const login = await api.post('/auth/login', {
      email: 'admin@mizano.com',
      password: 'password123',
    });
    expect(login.status).toBe(200);
    const a = client(apiBase(String(app.baseUrl)), login.body.tokens.accessToken);
    for (const id of ['wo-001', 'wo-002']) {
      const wo = (await a.get(`${WO}/${id}`)).body;
      expect(wo.status).toBe('COMPLETED');
      expect(wo.journalId).toBeTruthy();
      const bom = wo.bom;
      const materials = bom.items.reduce(
        (sum: number, l: any) =>
          sum +
          Math.round((Number(l.quantity) * wo.quantity) / bom.outputQuantity) *
            Number(l.item.costPrice),
        0,
      );
      const lines = (await a.get(`/journals/${wo.journalId}`)).body.lines;
      const total = (key: 'debit' | 'credit') =>
        lines.reduce((s: number, l: any) => s + Number(l[key]), 0);
      expect(total('debit')).toBeCloseTo(materials + Number(bom.operationsCost), 4);
      expect(total('credit')).toBeCloseTo(total('debit'), 4);
    }
    const tb = (await a.get('/accounting-reports/trial-balance')).body;
    expect(tb.totals.totalDebits).toBe(tb.totals.totalCredits);

    // Arabic: the list renders right-to-left and both orders read Completed (مكتمل).
    await app.open('/ar/manufacturing/work-orders');
    expect(await browser.evaluate(() => document.documentElement.dir)).toBe('rtl');
    for (const number of ['WO-001', 'WO-002']) {
      await expect(screen.getByRole('row').filter({ hasText: number })).toContainText('مكتمل');
    }
  },
);
