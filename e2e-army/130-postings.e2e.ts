/**
 * Issue #130 — payroll, asset depreciation/disposal and manufacturing COGM post through the single
 * ledger command (JournalsService): each posting is balanced, dated on the period/document date and
 * linked to its source event, so a repeated, concurrent or bulk run posts exactly one journal; a
 * locked period rejects the post; depreciation posts and reverses in period order and is corrected
 * by a linked reversal, never by un-posting.
 *
 * Request-level (lvl:api, no model): the verify stack runs the Nest API at E2E_ARMY_API (`/api`).
 * One organization per flow, derived from a fixed seed: the first run registers it, a re-run on the
 * same stack signs into it. Every flow creates its own records and asserts on those only (payroll
 * takes the latest months no earlier run used), so a re-run on the same stack passes as well. The
 * correlated DB-level evidence (line amounts, soft-delete, numbering) lives in
 * apps/api/test/system-postings.e2e-spec.ts.
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
/** List endpoints answer either an array or `{ data, meta }`. */
const rows = (body: any): any[] => (Array.isArray(body) ? body : (body?.data ?? []));

/** The auth routes allow 5 requests a minute per handler: a 429 is waited out, never failed on. */
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

/** The flow's organization with the default chart: registered on the first run, signed into on a re-run. */
async function tenant(app: { baseUrl?: string }, label: string): Promise<Tenant> {
  const api = apiBase(app);
  const email = `army-130-${label}-${hash(`org-${label}`)}@mizano.test`;
  let res = await authPost(api, '/auth/register', {
    email,
    password: PASSWORD,
    firstName: 'Army',
    lastName: label,
    organizationName: `Army 130 ${label} ${hash(`name-${label}`)}`,
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

/** Resolve chart account ids (and types) by code from the seeded chart. */
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

/** Exact debit/credit sums in 1/10000 units, so float noise can never hide an unbalanced journal. */
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
/** Exactly one of a concurrent pair may succeed; the loser is a clean 4xx, never a 500. */
function oneSuccess(statuses: number[]): void {
  expect(statuses.filter((s) => s >= 200 && s < 300)).toHaveLength(1);
  for (const s of statuses.filter((x) => x >= 300)) expect([400, 409]).toContain(s);
}
/** The lock-date route stores the body value as given, so the day goes out as a full ISO timestamp. */
async function setLockDate(t: Tenant, day: string | null): Promise<void> {
  const lockDate = day === null ? null : `${day}T00:00:00.000Z`;
  expect((await call(t, 'PATCH', '/organization/lock-date', { lockDate })).status).toBe(200);
}

test(
  '@issue-130 AC1/AC3: a payroll run posts one balanced PAYROLL journal, a lock date rejects it and a deleted run can be recreated',
  { tags: ['feat:mz-payroll', 'feat:mz-journals', 'lvl:api'] },
  async ({ app }) => {
    const t = await tenant(app, 'payroll');
    const email = `army-130-pay-${hash('emp')}@mizano.test`;
    // No query string: the employee list's default page is enough for this tenant.
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

    // The latest two months without a run (an earlier run on this stack took the ones before).
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

    // AC1 — paying a processed run twice concurrently posts exactly one balanced journal, dated on the period end.
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

    // AC3 — a lock date covering the period rejects the post and writes no journal.
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

    // A deleted, processed (unpaid) run never blocks its period: it comes back as a draft and recalculates.
    expect((await call(t, 'DELETE', `/payroll/runs/${lockedRun}`)).status).toBe(200);
    expect((await call(t, 'GET', `/payroll/runs/${lockedRun}`)).status).toBe(404);
    const recreated = await call(t, 'POST', '/payroll/runs', locked);
    expect(recreated.status).toBe(201);
    const draft = await json(recreated);
    expect(draft.id).toBe(lockedRun);
    expect(draft.status).toBe('DRAFT');
    expect((await call(t, 'POST', `/payroll/runs/${lockedRun}/calculate`)).status).toBe(201);
    const recalculated = await json(await call(t, 'GET', `/payroll/runs/${lockedRun}`));
    expect(recalculated.status).toBe('PROCESSED');
    // One live payslip per employee: the discarded ones no longer hold the (run, employee) key.
    const slipOwners = (recalculated.payslips as { employeeId: string }[]).map((s) => s.employeeId);
    expect(slipOwners).toContain(employeeId);
    expect(new Set(slipOwners).size).toBe(slipOwners.length);
  },
);

test(
  '@issue-130 AC1/AC2/AC3: depreciation posts once and in period order, a lock date rejects it, and a reversal is linked',
  { tags: ['feat:mz-asset-depreciation', 'feat:mz-fixed-assets', 'lvl:api'] },
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
    /** This asset's DEPRECIATION journals (an earlier run's assets share the organization). */
    const postedFor = async (p?: Period) =>
      (await journalsFor(t, 'DEPRECIATION')).filter((j) =>
        (p ? [scheduleOf(p)] : schedule.map((s: any) => s.id as string)).some((id) =>
          String(j.sourceId).startsWith(id),
        ),
      );

    // AC3 — the lock date rejects the posting, leaving the schedule unexecuted and the ledger empty.
    await setLockDate(t, monthEnd(first));
    try {
      const blocked = await depreciate(first);
      expect(blocked.status).toBe(400);
      expect(String((await json(blocked)).message)).toMatch(/locked/i);
    } finally {
      await setLockDate(t, null);
    }
    expect(await postedFor()).toHaveLength(0);

    // AC1 — two concurrent runs of the same period post one balanced journal dated on the period end.
    const runs = await Promise.all([depreciate(first), depreciate(first)]);
    for (const r of runs) expect(r.status).toBeLessThan(500);
    const [journal, ...extra] = await postedFor(first);
    expect(extra).toHaveLength(0);
    const total = sumLines(journal.lines);
    expect(total.debit).toBe(total.credit);
    expect(journal.date.slice(0, 10)).toBe(monthEnd(first));

    // Periods post and reverse in order: no skipping an open period, no reversing behind a later one.
    const skipped = await depreciate(third);
    expect(skipped.status).toBe(400);
    expect(String((await json(skipped)).message)).toMatch(/earlier/i);
    expect((await depreciate(second)).status).toBe(200);
    const behind = await reverse(first);
    expect(behind.status).toBe(400);
    expect(String((await json(behind)).message)).toMatch(/later/i);

    // AC2 — the reversal keeps the original posted and adds a posted, balanced journal linked to it.
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

    // The asset register follows the ledger: only the first period is still posted.
    const register = await json(await call(t, 'GET', `/assets/${assetId}`));
    expect(units(register.accumulatedDepreciation)).toBe(units('83.33'));
    expect(units(register.currentBookValue)).toBe(units('916.67'));

    // The monthly run catches up the open periods, oldest first, and never repeats one.
    const run = await call(t, 'POST', '/assets/depreciation/run');
    expect(run.status).toBe(200);
    expect((await json(run)).journalsCreated).toBeGreaterThanOrEqual(2);
    for (const p of [second, third]) {
      const live = (await postedFor(p)).filter((j) => !j.reversedBy);
      expect(live).toHaveLength(1);
      expect(live[0].date.slice(0, 10)).toBe(monthEnd(p));
    }
    expect((await json(await call(t, 'POST', '/assets/depreciation/run'))).journalsCreated).toBe(0);
    const caughtUp = await json(await call(t, 'GET', `/assets/${assetId}`));
    expect(units(caughtUp.accumulatedDepreciation)).toBe(units('249.99'));
  },
);

test(
  '@issue-130 AC1: disposals post one balanced ASSET_DISPOSAL journal, with gain and loss on the right side',
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

    // Disposing twice concurrently posts one journal: Dr cash 600 + Dr loss 400 = Cr asset 1000.
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
    expect(lossLine.accountId).not.toBe(code('6100')); // never Rent Expense

    // A gain is credited to an income account: Dr cash 1200 = Cr asset 1000 + Cr gain 200.
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

    // A fully depreciated asset can still be disposed of (written off at zero book value).
    const wornId = await createAsset('Tablet', 1);
    const periods = rows(await json(await call(t, 'GET', `/assets/${wornId}/schedule`)));
    for (const p of periods) {
      const res = await call(
        t,
        'POST',
        `/assets/${wornId}/depreciate?month=${p.month}&year=${p.year}`,
      );
      expect(res.status).toBe(200);
    }
    expect((await json(await call(t, 'GET', `/assets/${wornId}`))).status).toBe(
      'FULLY_DEPRECIATED',
    );
    const writeOff = await call(t, 'POST', `/assets/${wornId}/dispose`, {
      disposalDate: monthEnd(periods[periods.length - 1]),
      disposalAmount: 0,
    });
    expect(writeOff.status).toBe(200);
    const [writeOffJournal] = await journalsFor(t, 'ASSET_DISPOSAL', wornId);
    const removed = sumLines(writeOffJournal.lines);
    expect(removed.debit).toBe(1000 * SCALE); // Dr accumulated depreciation 1000 = Cr asset 1000
    expect(removed.debit).toBe(removed.credit);
  },
);

test(
  '@issue-130 AC1: completing work orders, one by one, concurrently or in bulk, posts one balanced COGM journal each',
  { tags: ['feat:mz-work-orders', 'feat:mz-bom', 'lvl:api'] },
  async ({ app }) => {
    const t = await tenant(app, 'cogm');
    // The retail chart adds the inventory account (1100) the services chart lacks.
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
    /** One balanced COGM journal: 3.3333 x (1/3 consumed) at currency scale = 1.11. */
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

    // Bulk completion runs the same guarded command per order: one COGM journal each, never twice.
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

test(
  '@issue-130 AC-CORS: local web redirects preserve 127.0.0.1 origin and return CORS headers',
  { tags: ['feat:mz-payroll', 'feat:mz-fixed-assets', 'feat:mz-work-orders', 'lvl:api'] },
  async ({ app }) => {
    const webBase = (app.baseUrl ?? 'http://127.0.0.1:3000').replace(/\/+$/, '');
    if (!webBase.startsWith('http://127.0.0.1:')) return;

    // A request without locale prefix to 127.0.0.1 must redirect on 127.0.0.1 (never localhost)
    const res = await fetch(`${webBase}/hr/payroll`, {
      redirect: 'manual',
      headers: {
        host: new URL(webBase).host,
        origin: webBase,
      },
    });

    if (res.status === 307 || res.status === 308) {
      const loc = res.headers.get('location') ?? '';
      expect(loc).toContain('127.0.0.1');
      expect(loc).not.toContain('localhost');
      expect(res.headers.get('access-control-allow-origin')).toBe(webBase);
    }
  },
);
