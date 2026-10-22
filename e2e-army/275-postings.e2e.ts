/**
 * Issue #275 (replaces #195, implements #130) — payroll, asset depreciation/disposal, and
 * manufacturing COGM post through the single ledger command (JournalsService).
 *
 * Each posting is balanced, dated on the period/document date, and linked to its source event:
 * - Repeated, concurrent, or bulk runs post exactly one journal per source event.
 * - A fiscal lock date covering the posting date rejects the post.
 * - Depreciation posts and reverses in period order, and reversal produces a linked reversal
 *   journal rather than mutating or deleting historical entries.
 * - Work order bulk completion routes through the guarded single completion command.
 */
import { createHash } from 'node:crypto';
import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

const PASSWORD = 'Army-275-Passw0rd';
const SEED = process.env.E2E_ARMY_SEED ?? 'nql-e2e-army-275';
const SCALE = 10000;

interface Period {
  month: number;
  year: number;
}
interface Tenant {
  api: string;
  token: string;
  organizationId: string;
}

const hash = (name: string) =>
  createHash('sha1').update(`${SEED}:${name}`).digest('hex').slice(0, 8);
const pad2 = (n: number) => String(n).padStart(2, '0');

function monthOf(offset: number): Period {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1));
  return { month: d.getUTCMonth() + 1, year: d.getUTCFullYear() };
}
const monthEnd = (p: Period) => new Date(Date.UTC(p.year, p.month, 0)).toISOString().slice(0, 10);
const dayIn = (p: Period, day: number) => `${p.year}-${pad2(p.month)}-${pad2(day)}`;

const apiBase = (app: { baseUrl?: string }) =>
  (
    process.env.E2E_ARMY_API ??
    process.env.E2E_ARMY_URL ??
    app.baseUrl ??
    'http://127.0.0.1:3000'
  ).replace(/\/+$/, '');

async function call(t: Tenant, method: string, path: string, body?: unknown): Promise<Response> {
  return fetch(`${t.api}${path}`, {
    method,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${t.token}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
const json = async (res: Response) => res.json().catch(() => ({}));
const rows = (body: any): any[] => (Array.isArray(body) ? body : (body?.data ?? []));

async function authPost(api: string, path: string, body: unknown): Promise<Response> {
  const send = () =>
    fetch(`${api}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  let res = await send();
  if (res.status === 429) {
    await expect
      .poll(async () => (res = await send()).status, { timeout: 85_000, interval: 5_000 })
      .not.toBe(429);
  }
  return res;
}

async function tenant(app: { baseUrl?: string }, label: string): Promise<Tenant> {
  const api = apiBase(app);
  const email = `army-275-${label}-${hash(`org-${label}`)}@mizano.test`;
  let res = await authPost(api, '/auth/register', {
    email,
    password: PASSWORD,
    firstName: 'Army',
    lastName: label,
    organizationName: `Army 275 ${label} ${hash(`name-${label}`)}`,
  });
  if (res.status === 409) res = await authPost(api, '/auth/login', { email, password: PASSWORD });
  expect([200, 201]).toContain(res.status);
  const body = await json(res);
  const t: Tenant = {
    api,
    token: body.tokens.accessToken,
    organizationId: body.organization?.id ?? body.user?.organizationId,
  };
  expect((await call(t, 'POST', '/accounts/seed-defaults')).status).toBe(201);
  return t;
}

async function chartOf(t: Tenant): Promise<{
  code: (code: string) => string;
  typeOf: (id: string) => string | undefined;
}> {
  const res = await call(t, 'GET', '/accounts?limit=500');
  expect(res.status).toBe(200);
  const accounts = rows(await json(res)) as { code: string; id: string; type: string }[];
  const byCode = new Map(accounts.map((a) => [a.code, a.id]));
  const typeById = new Map(accounts.map((a) => [a.id, a.type]));
  return {
    code: (code: string) => {
      const id = byCode.get(code);
      if (!id) throw new Error(`account ${code} is missing from the seeded chart`);
      return id;
    },
    typeOf: (id: string) => typeById.get(id),
  };
}

const units = (v: unknown) => Math.round(Number(v) * SCALE);
function sumLines(lines: { debit: unknown; credit: unknown }[]): { debit: number; credit: number } {
  return lines.reduce<{ debit: number; credit: number }>(
    (s, l) => ({ debit: s.debit + units(l.debit), credit: s.credit + units(l.credit) }),
    { debit: 0, credit: 0 },
  );
}

async function journalsFor(t: Tenant, sourceType: string, sourceId?: string): Promise<any[]> {
  const res = await call(t, 'GET', '/journals?limit=500');
  expect(res.status).toBe(200);
  return rows(await json(res)).filter(
    (j: any) => j.sourceType === sourceType && (sourceId === undefined || j.sourceId === sourceId),
  );
}

function oneSuccess(statuses: number[]): void {
  expect(statuses.filter((s) => s >= 200 && s < 300)).toHaveLength(1);
  for (const s of statuses.filter((x) => x >= 300)) expect([400, 409]).toContain(s);
}

async function setLockDate(t: Tenant, day: string | null): Promise<void> {
  const lockDate = day === null ? null : `${day}T00:00:00.000Z`;
  expect((await call(t, 'PATCH', '/organization/lock-date', { lockDate })).status).toBe(200);
}

test(
  '@issue-275 AC1: a payroll run posts one balanced PAYROLL journal and a lock date rejects it',
  { tags: ['feat:mz-payroll', 'lvl:api'] },
  async ({ app }) => {
    const t = await tenant(app, 'payroll');
    const email = `army-275-pay-${hash('emp')}@mizano.test`;
    const staff = rows(await json(await call(t, 'GET', '/employees')));
    let employeeId = staff.find((e: any) => e.email === email)?.id as string | undefined;
    if (!employeeId) {
      const employee = await call(t, 'POST', '/employees', {
        name: 'Army Payroll',
        email,
        dateOfJoining: '2020-01-01',
        basicSalary: '10000',
        allowances: { housing: 333.33 },
        deductions: { loan: 100.25 },
      });
      expect(employee.status).toBe(201);
      employeeId = (await json(employee)).id as string;
    }

    const runs = rows(await json(await call(t, 'GET', '/payroll/runs?limit=100')));
    const taken = new Set(runs.map((r: any) => `${r.year}-${r.month}`));
    const free: Period[] = [];
    for (let offset = -2; free.length < 2; offset--) {
      const p = monthOf(offset);
      if (!taken.has(`${p.year}-${p.month}`)) free.push(p);
    }
    const [period, locked] = free;

    const processRun = async (p: Period): Promise<string> => {
      await call(t, 'POST', '/attendance', { employeeId, date: dayIn(p, 10), status: 'PRESENT' });
      const created = await call(t, 'POST', '/payroll/runs', p);
      expect(created.status).toBe(201);
      const runId = (await json(created)).id as string;
      expect((await call(t, 'POST', `/payroll/runs/${runId}/calculate`)).status).toBe(201);
      return runId;
    };

    const runId = await processRun(period);
    const paid = await Promise.all([
      call(t, 'POST', `/payroll/runs/${runId}/paid`),
      call(t, 'POST', `/payroll/runs/${runId}/paid`),
    ]);
    oneSuccess(paid.map((r) => r.status));
    const posted = await journalsFor(t, 'PAYROLL', runId);
    expect(posted).toHaveLength(1);
    const total = sumLines(posted[0].lines);
    expect(total.debit).toBeGreaterThan(0);
    expect(total.debit).toBe(total.credit);
    expect(posted[0].isPosted).toBe(true);
    expect(posted[0].date.slice(0, 10)).toBe(monthEnd(period));

    const lockedRun = await processRun(locked);
    await setLockDate(t, monthEnd(locked));
    try {
      const blocked = await call(t, 'POST', `/payroll/runs/${lockedRun}/paid`);
      expect(blocked.status).toBe(400);
      expect(String((await json(blocked)).message)).toMatch(/locked/i);
    } finally {
      await setLockDate(t, null);
    }
    expect(await journalsFor(t, 'PAYROLL', lockedRun)).toHaveLength(0);
  },
);

test(
  '@issue-275 AC2: depreciation posts once in period order, lock date rejects it, and reversal is linked',
  { tags: ['feat:mz-fixed-assets', 'lvl:api'] },
  async ({ app }) => {
    const t = await tenant(app, 'deprec');
    const { code } = await chartOf(t);
    const [first, second, third] = [monthOf(-2), monthOf(-1), monthOf(0)];
    const created = await call(t, 'POST', '/assets', {
      name: `Army Laptop ${hash('asset')}`,
      assetType: 'ELECTRONICS',
      purchaseDate: dayIn(first, 1),
      purchasePrice: 1000,
      salvageValue: 0,
      usefulLifeYears: 1,
      assetAccountId: code('1510'),
      depreciationAccountId: code('6700'),
      accumulatedDeprAccountId: code('1600'),
    });
    expect(created.status).toBe(201);
    const assetId = (await json(created)).id as string;
    const scheduleRes = await call(t, 'GET', `/assets/${assetId}/schedule`);
    expect(scheduleRes.status).toBe(200);
    const schedule = rows(await json(scheduleRes));
    const scheduleOf = (p: Period) =>
      schedule.find((s: any) => s.month === p.month && s.year === p.year).id as string;
    const depreciate = (p: Period) =>
      call(t, 'POST', `/assets/${assetId}/depreciate?month=${p.month}&year=${p.year}`);
    const reverse = (p: Period) => call(t, 'POST', `/assets/schedule/${scheduleOf(p)}/reverse`);

    const postedFor = async (p?: Period) =>
      (await journalsFor(t, 'DEPRECIATION')).filter((j) =>
        (p ? [scheduleOf(p)] : schedule.map((s: any) => s.id as string)).some((id) =>
          String(j.sourceId).startsWith(id),
        ),
      );

    await setLockDate(t, monthEnd(first));
    try {
      const blocked = await depreciate(first);
      expect(blocked.status).toBe(400);
      expect(String((await json(blocked)).message)).toMatch(/locked/i);
    } finally {
      await setLockDate(t, null);
    }
    expect(await postedFor()).toHaveLength(0);

    const runs = await Promise.all([depreciate(first), depreciate(first)]);
    for (const r of runs) expect(r.status).toBeLessThan(500);
    const [journal, ...extra] = await postedFor(first);
    expect(extra).toHaveLength(0);
    const total = sumLines(journal.lines);
    expect(total.debit).toBe(total.credit);
    expect(journal.date.slice(0, 10)).toBe(monthEnd(first));

    expect((await depreciate(second)).status).toBe(200);
    const [original] = await postedFor(second);
    expect((await reverse(second)).status).toBe(204);
    const after = await journalsFor(t, 'DEPRECIATION');
    const kept = after.find((j) => j.id === original.id);
    expect(kept.isPosted).toBe(true);
    expect(kept.reversedBy?.id).toBeTruthy();
    const reversal = (await journalsFor(t, 'DEPRECIATION_REVERSAL', original.id))[0];
    expect(reversal?.id).toBe(kept.reversedBy.id);
    expect(reversal.isPosted).toBe(true);
    const rev = sumLines(reversal.lines);
    expect(rev.debit).toBe(rev.credit);
  },
);

test(
  '@issue-275 AC3: disposals post one balanced ASSET_DISPOSAL journal with gain/loss accounts',
  { tags: ['feat:mz-fixed-assets', 'lvl:api'] },
  async ({ app }) => {
    const t = await tenant(app, 'dispose');
    const { code, typeOf } = await chartOf(t);
    const purchase = monthOf(-2);
    const createAsset = async (name: string, usefulLifeYears: number): Promise<string> => {
      const created = await call(t, 'POST', '/assets', {
        name: `Army ${name} ${hash(name)}`,
        assetType: 'ELECTRONICS',
        purchaseDate: dayIn(purchase, 1),
        purchasePrice: 1000,
        salvageValue: 0,
        usefulLifeYears,
        assetAccountId: code('1510'),
        depreciationAccountId: code('6700'),
        accumulatedDeprAccountId: code('1600'),
      });
      expect(created.status).toBe(201);
      return (await json(created)).id as string;
    };
    const disposalDate = dayIn(purchase, 15);

    const lossId = await createAsset('Server', 5);
    const disposed = await Promise.all([
      call(t, 'POST', `/assets/${lossId}/dispose`, { disposalDate, disposalAmount: 600 }),
      call(t, 'POST', `/assets/${lossId}/dispose`, { disposalDate, disposalAmount: 600 }),
    ]);
    oneSuccess(disposed.map((r) => r.status));
    const [lossJournal, ...twice] = await journalsFor(t, 'ASSET_DISPOSAL', lossId);
    expect(twice).toHaveLength(0);
    const loss = sumLines(lossJournal.lines);
    expect(loss.debit).toBe(1000 * SCALE);
    expect(loss.debit).toBe(loss.credit);
    expect(lossJournal.date.slice(0, 10)).toBe(disposalDate);
    const lossLine = lossJournal.lines.find((l: any) => units(l.debit) === 400 * SCALE);
    expect(typeOf(lossLine.accountId)).toBe('EXPENSE');
    expect(lossLine.accountId).not.toBe(code('6100'));

    const gainId = await createAsset('Printer', 5);
    const sold = await call(t, 'POST', `/assets/${gainId}/dispose`, {
      disposalDate,
      disposalAmount: 1200,
    });
    expect(sold.status).toBe(200);
    const [gainJournal] = await journalsFor(t, 'ASSET_DISPOSAL', gainId);
    const gain = sumLines(gainJournal.lines);
    expect(gain.debit).toBe(1200 * SCALE);
    expect(gain.debit).toBe(gain.credit);
    const gainLine = gainJournal.lines.find((l: any) => units(l.credit) === 200 * SCALE);
    expect(['INCOME', 'REVENUE']).toContain(typeOf(gainLine.accountId));
  },
);

test(
  '@issue-275 AC4: completing work orders individually or in bulk posts balanced COGM journals',
  { tags: ['feat:mz-work-orders', 'lvl:api'] },
  async ({ app }) => {
    const t = await tenant(app, 'cogm');
    expect((await call(t, 'POST', '/accounts/seed/retail')).status).toBe(201);
    const { code } = await chartOf(t);
    const inventory = code('1100');

    const whCode = `AW${hash('wh')}`;
    const warehouses = rows(await json(await call(t, 'GET', '/warehouses?limit=500')));
    let warehouseId = warehouses.find((w: any) => w.code === whCode)?.id as string | undefined;
    if (!warehouseId) {
      const res = await call(t, 'POST', '/warehouses', {
        code: whCode,
        name: 'Army Warehouse',
        isDefault: true,
      });
      expect(res.status).toBe(201);
      warehouseId = (await json(res)).id as string;
    }
    const item = async (sku: string, body: Record<string, unknown>): Promise<string> => {
      const found = rows(await json(await call(t, 'GET', `/items?search=${sku}&limit=50`)));
      const existing = found.find((i: any) => i.sku === sku);
      if (existing) return existing.id as string;
      const res = await call(t, 'POST', '/items', { ...body, sku, type: 'GOODS' });
      expect(res.status).toBe(201);
      return (await json(res)).id as string;
    };
    const rawId = await item(`RAW-${hash('raw')}`, {
      name: 'Army Resin',
      sellingPrice: '0',
      costPrice: '3.3333',
      inventoryAccountId: inventory,
    });
    const outId = await item(`OUT-${hash('out')}`, {
      name: 'Army Widget',
      sellingPrice: '10',
      inventoryAccountId: inventory,
    });

    const adj = await call(t, 'POST', '/inventory-adjustments', {
      date: dayIn(monthOf(-2), 5),
      warehouseId,
      itemId: rawId,
      type: 'INCREASE',
      quantity: 10,
      reason: 'STOCKTAKE',
      accountId: code('6100'),
    });
    expect(adj.status).toBe(201);

    const bomRes = await call(t, 'POST', '/manufacturing/bom', {
      name: 'Army BOM',
      outputItemId: outId,
      outputQuantity: 3,
      components: [{ itemId: rawId, quantity: 1 }],
    });
    expect(bomRes.status).toBe(201);
    const bomId = (await json(bomRes)).id as string;
    const startedOrder = async (): Promise<string> => {
      const wo = await call(t, 'POST', '/manufacturing/work-orders', { bomId, quantity: 1 });
      expect(wo.status).toBe(201);
      const id = (await json(wo)).id as string;
      expect((await call(t, 'POST', `/manufacturing/work-orders/${id}/start`)).status).toBe(201);
      return id;
    };

    const expectOneCogm = async (workOrderId: string): Promise<void> => {
      const posted = await journalsFor(t, 'COGM', workOrderId);
      expect(posted).toHaveLength(1);
      const total = sumLines(posted[0].lines);
      expect(total.debit).toBe(total.credit);
      expect(total.debit).toBe(Math.round(1.11 * SCALE));
    };

    const workOrderId = await startedOrder();
    const completed = await Promise.all([
      call(t, 'POST', `/manufacturing/work-orders/${workOrderId}/complete`, {
        quantityProduced: 1,
      }),
      call(t, 'POST', `/manufacturing/work-orders/${workOrderId}/complete`, {
        quantityProduced: 1,
      }),
    ]);
    oneSuccess(completed.map((r) => r.status));
    await expectOneCogm(workOrderId);

    const ids = [await startedOrder(), await startedOrder()];
    const bulk = await call(t, 'POST', '/manufacturing/work-orders/bulk-complete', { ids });
    expect(bulk.status).toBe(201);
    expect(await json(bulk)).toMatchObject({ processed: 2, total: 2, failures: [] });
    for (const id of ids) await expectOneCogm(id);

    const again = await json(
      await call(t, 'POST', '/manufacturing/work-orders/bulk-complete', { ids }),
    );
    expect(again).toMatchObject({ processed: 0, total: 2 });
    expect(again.failures).toHaveLength(2);
    for (const id of ids) await expectOneCogm(id);
  },
);
