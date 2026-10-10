/**
 * Issue #130 — payroll, asset depreciation/disposal and manufacturing COGM post through the single
 * ledger command (JournalsService): each posting is balanced, dated on the period/document date and
 * linked to its source event, so a repeated or concurrent run posts exactly one journal; a locked
 * period rejects the post and depreciation is corrected by a linked reversal, never by un-posting.
 *
 * Request-level (lvl:api, no model): the verify stack runs the Nest API at E2E_ARMY_API (`/api`).
 * One fresh organization per flow (POST /auth/register) keeps the ledger isolated. Data is derived
 * from a fixed seed, so a re-run on the same stack reuses the same organization. The correlated
 * DB-level evidence (line amounts, soft-delete, numbering) lives in apps/api/test/system-postings.e2e-spec.ts.
 */
import { createHash } from 'node:crypto';
import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

const PASSWORD = 'Army-130-Passw0rd';
const SEED = process.env.E2E_ARMY_SEED ?? 'nql-e2e-army-1';
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
/** Month `offset` months from the current UTC month (the ledger period under test). */
function monthOf(offset: number): Period {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1));
  return { month: d.getUTCMonth() + 1, year: d.getUTCFullYear() };
}
const monthEnd = (p: Period) => new Date(Date.UTC(p.year, p.month, 0)).toISOString().slice(0, 10);
const dayIn = (p: Period, day: number) => `${p.year}-${pad2(p.month)}-${pad2(day)}`;

/** Mizano's Nest API has its own origin (`E2E_ARMY_API`, `…/api`); the web origin is the fallback. */
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

/** A brand-new organization with the default chart of accounts (an isolated ledger per flow). */
async function freshTenant(app: { baseUrl?: string }, label: string): Promise<Tenant> {
  const api = apiBase(app);
  const email = `army-130-${label}-${hash(`org-${label}`)}@mizano.test`;
  const headers = { 'content-type': 'application/json' };
  await fetch(`${api}/auth/register`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      email,
      password: PASSWORD,
      firstName: 'Army',
      lastName: label,
      organizationName: `Army 130 ${label} ${hash(`name-${label}`)}`,
    }),
  });
  const login = await fetch(`${api}/auth/login`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  expect(login.status).toBe(200);
  const { user, tokens } = await json(login);
  const tenant: Tenant = { api, token: tokens.accessToken, organizationId: user.organizationId };
  await call(tenant, 'POST', '/accounts/seed-defaults');
  return tenant;
}

/** Resolve a chart account id by code from the seeded default chart. */
async function accountCodes(t: Tenant): Promise<(code: string) => string> {
  const res = await call(t, 'GET', '/accounts?limit=500');
  expect(res.status).toBe(200);
  const { data } = await json(res);
  const byCode = new Map<string, string>(
    (data as { code: string; id: string }[]).map((a) => [a.code, a.id]),
  );
  return (code: string) => {
    const id = byCode.get(code);
    if (!id) throw new Error(`account ${code} is missing from the seeded chart`);
    return id;
  };
}

/** Exact debit/credit sums in 1/10000 units, so float noise can never hide an unbalanced journal. */
const units = (v: unknown) => Math.round(Number(v) * SCALE);
function sumLines(lines: { debit: unknown; credit: unknown }[]): { debit: number; credit: number } {
  return lines.reduce(
    (s, l) => ({ debit: s.debit + units(l.debit), credit: s.credit + units(l.credit) }),
    { debit: 0, credit: 0 },
  );
}
async function journalsFor(t: Tenant, sourceType: string, sourceId?: string): Promise<any[]> {
  const res = await call(t, 'GET', '/journals?limit=500');
  expect(res.status).toBe(200);
  const body = await json(res);
  return (body.data ?? body).filter(
    (j: any) => j.sourceType === sourceType && (sourceId === undefined || j.sourceId === sourceId),
  );
}
/** Exactly one of a concurrent pair may succeed; the loser is a clean 4xx, never a 500. */
function oneSuccess(statuses: number[]): void {
  expect(statuses.filter((s) => s >= 200 && s < 300)).toHaveLength(1);
  for (const s of statuses.filter((x) => x >= 300)) expect([400, 409]).toContain(s);
}

test(
  '@issue-130 AC1/AC3: a payroll run posts one balanced PAYROLL journal and a lock date rejects it',
  { tags: ['feat:mz-payroll', 'feat:mz-journals', 'lvl:api'] },
  async ({ app }) => {
    const t = await freshTenant(app, 'payroll');
    const employee = await call(t, 'POST', '/employees', {
      name: 'Army Payroll',
      email: `army-130-pay-${hash('emp')}@mizano.test`,
      dateOfJoining: '2020-01-01',
      basicSalary: '10000',
      allowances: { housing: 333.33 },
      deductions: { loan: 100.25 },
    });
    expect(employee.status).toBe(201);
    const employeeId = (await json(employee)).id as string;

    const processRun = async (period: Period): Promise<string> => {
      await call(t, 'POST', '/attendance', {
        employeeId,
        date: dayIn(period, 10),
        status: 'PRESENT',
      });
      const created = await call(t, 'POST', '/payroll/runs', period);
      expect(created.status).toBe(201);
      const runId = (await json(created)).id as string;
      expect((await call(t, 'POST', `/payroll/runs/${runId}/calculate`)).status).toBe(201);
      return runId;
    };

    // AC1 — paying a processed run twice concurrently posts exactly one balanced journal, dated on the period end.
    const period = monthOf(-2);
    const runId = await processRun(period);
    const paid = await Promise.all([
      call(t, 'POST', `/payroll/runs/${runId}/paid`),
      call(t, 'POST', `/payroll/runs/${runId}/paid`),
    ]);
    oneSuccess(paid.map((r) => r.status));
    const rows = await journalsFor(t, 'PAYROLL', runId);
    expect(rows).toHaveLength(1);
    const total = sumLines(rows[0].lines);
    expect(total.debit).toBeGreaterThan(0);
    expect(total.debit).toBe(total.credit);
    expect(rows[0].isPosted).toBe(true);
    expect(rows[0].date.slice(0, 10)).toBe(monthEnd(period));

    // AC3 — a lock date covering the period rejects the post and writes no journal.
    const locked = monthOf(-3);
    const lockedRun = await processRun(locked);
    expect(
      (await call(t, 'PATCH', '/organization/lock-date', { lockDate: monthEnd(locked) })).status,
    ).toBe(200);
    try {
      const blocked = await call(t, 'POST', `/payroll/runs/${lockedRun}/paid`);
      expect(blocked.status).toBe(400);
      expect(String((await json(blocked)).message)).toMatch(/locked/i);
    } finally {
      await call(t, 'PATCH', '/organization/lock-date', { lockDate: null });
    }
    expect(await journalsFor(t, 'PAYROLL', lockedRun)).toHaveLength(0);
  },
);

test(
  '@issue-130 AC1/AC2/AC3: depreciation posts once, a lock date rejects it, and a reversal is linked',
  { tags: ['feat:mz-asset-depreciation', 'feat:mz-fixed-assets', 'lvl:api'] },
  async ({ app }) => {
    const t = await freshTenant(app, 'deprec');
    const code = await accountCodes(t);
    const purchase = monthOf(-2);
    const created = await call(t, 'POST', '/assets', {
      name: `Army Laptop ${hash('asset')}`,
      assetType: 'ELECTRONICS',
      purchaseDate: dayIn(purchase, 1),
      purchasePrice: 1000,
      salvageValue: 0,
      usefulLifeYears: 1,
      assetAccountId: code('1510'),
      depreciationAccountId: code('6700'),
      accumulatedDeprAccountId: code('1600'),
    });
    expect(created.status).toBe(201);
    const assetId = (await json(created)).id as string;

    // AC3 — the lock date rejects the posting, leaving the schedule unexecuted and the ledger empty.
    expect(
      (await call(t, 'PATCH', '/organization/lock-date', { lockDate: monthEnd(purchase) })).status,
    ).toBe(200);
    const blocked = await call(
      t,
      'POST',
      `/assets/${assetId}/depreciate?month=${purchase.month}&year=${purchase.year}`,
    );
    expect(blocked.status).toBe(400);
    expect(String((await json(blocked)).message)).toMatch(/locked/i);
    await call(t, 'PATCH', '/organization/lock-date', { lockDate: null });
    expect(await journalsFor(t, 'DEPRECIATION')).toHaveLength(0);

    // AC1 — two concurrent runs of the same period post one balanced journal dated on the period end.
    const runs = await Promise.all([
      call(
        t,
        'POST',
        `/assets/${assetId}/depreciate?month=${purchase.month}&year=${purchase.year}`,
      ),
      call(
        t,
        'POST',
        `/assets/${assetId}/depreciate?month=${purchase.month}&year=${purchase.year}`,
      ),
    ]);
    for (const r of runs) expect(r.status).toBeLessThan(500);
    const scheduleRes = await call(t, 'GET', `/assets/${assetId}/schedule`);
    expect(scheduleRes.status).toBe(200);
    const schedule = (await json(scheduleRes)).find(
      (s: any) => s.month === purchase.month && s.year === purchase.year,
    );
    expect(schedule?.id).toBeTruthy();
    const posted = await journalsFor(t, 'DEPRECIATION', schedule.id);
    expect(posted).toHaveLength(1);
    const total = sumLines(posted[0].lines);
    expect(total.debit).toBe(total.credit);
    expect(posted[0].date.slice(0, 10)).toBe(monthEnd(purchase));

    // AC2 — the reversal keeps the original posted and adds a posted, balanced journal linked to it.
    expect((await call(t, 'POST', `/assets/schedule/${schedule.id}/reverse`)).status).toBe(204);
    const after = await journalsFor(t, 'DEPRECIATION');
    const original = after.find((j) => j.id === posted[0].id);
    expect(original.isPosted).toBe(true);
    expect(original.reversedBy?.id).toBeTruthy();
    const reversal = after.find((j) => j.id === original.reversedBy.id);
    expect(reversal?.isPosted).toBe(true);
    const rev = sumLines(reversal.lines);
    expect(rev.debit).toBe(rev.credit);
  },
);

test(
  '@issue-130 AC1: disposing an asset twice concurrently posts one balanced ASSET_DISPOSAL journal',
  { tags: ['feat:mz-fixed-assets', 'lvl:api'] },
  async ({ app }) => {
    const t = await freshTenant(app, 'dispose');
    const code = await accountCodes(t);
    const purchase = monthOf(-2);
    const created = await call(t, 'POST', '/assets', {
      name: `Army Server ${hash('disposed')}`,
      assetType: 'ELECTRONICS',
      purchaseDate: dayIn(purchase, 1),
      purchasePrice: 1000,
      salvageValue: 0,
      usefulLifeYears: 5,
      assetAccountId: code('1510'),
      depreciationAccountId: code('6700'),
      accumulatedDeprAccountId: code('1600'),
    });
    expect(created.status).toBe(201);
    const assetId = (await json(created)).id as string;

    const disposalDate = dayIn(purchase, 15);
    const disposed = await Promise.all([
      call(t, 'POST', `/assets/${assetId}/dispose`, { disposalDate, disposalAmount: 600 }),
      call(t, 'POST', `/assets/${assetId}/dispose`, { disposalDate, disposalAmount: 600 }),
    ]);
    oneSuccess(disposed.map((r) => r.status));
    const rows = await journalsFor(t, 'ASSET_DISPOSAL', assetId);
    expect(rows).toHaveLength(1);
    const total = sumLines(rows[0].lines);
    // Dr cash 600 + Dr loss 400 = Cr asset 1000: the cash/loss lines are never dropped.
    expect(total.debit).toBe(1000 * SCALE);
    expect(total.debit).toBe(total.credit);
    expect(rows[0].date.slice(0, 10)).toBe(disposalDate);
  },
);

test(
  '@issue-130 AC1: completing a work order twice concurrently posts one balanced COGM journal',
  { tags: ['feat:mz-work-orders', 'feat:mz-bom', 'lvl:api'] },
  async ({ app }) => {
    const t = await freshTenant(app, 'cogm');
    const code = await accountCodes(t);
    const inventory = code('1100');
    const warehouseRes = await call(t, 'POST', '/warehouses', {
      code: `AW${hash('wh')}`,
      name: 'Army Warehouse',
      isDefault: true,
    });
    expect(warehouseRes.status).toBe(201);
    const warehouseId = (await json(warehouseRes)).id as string;

    const rawRes = await call(t, 'POST', '/items', {
      name: 'Army Resin',
      sku: `RAW-${hash('raw')}`,
      type: 'GOODS',
      sellingPrice: '0',
      costPrice: '3.3333',
      inventoryAccountId: inventory,
    });
    expect(rawRes.status).toBe(201);
    const rawId = (await json(rawRes)).id as string;
    const outRes = await call(t, 'POST', '/items', {
      name: 'Army Widget',
      sku: `OUT-${hash('out')}`,
      type: 'GOODS',
      sellingPrice: '10',
      inventoryAccountId: inventory,
    });
    expect(outRes.status).toBe(201);
    const outId = (await json(outRes)).id as string;

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
    const woRes = await call(t, 'POST', '/manufacturing/work-orders', { bomId, quantity: 1 });
    expect(woRes.status).toBe(201);
    const workOrderId = (await json(woRes)).id as string;
    expect((await call(t, 'POST', `/manufacturing/work-orders/${workOrderId}/start`)).status).toBe(
      201,
    );

    const completed = await Promise.all([
      call(t, 'POST', `/manufacturing/work-orders/${workOrderId}/complete`, {
        quantityProduced: 1,
      }),
      call(t, 'POST', `/manufacturing/work-orders/${workOrderId}/complete`, {
        quantityProduced: 1,
      }),
    ]);
    oneSuccess(completed.map((r) => r.status));
    const rows = await journalsFor(t, 'COGM', workOrderId);
    expect(rows).toHaveLength(1);
    const total = sumLines(rows[0].lines);
    expect(total.debit).toBe(total.credit);
    expect(total.debit).toBe(Math.round(1.11 * SCALE)); // 3.3333 x (1/3 consumed) at currency scale
  },
);
