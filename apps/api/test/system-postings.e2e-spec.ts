/**
 * Payroll, depreciation, asset disposal and COGM post through the single ledger command
 * (JournalsService): each posting is balanced, Decimal-exact, dated on its period/document date,
 * linked to its source event so a double run posts once, rejected inside a locked period, and
 * depreciation is corrected by a linked reversal instead of un-posting history (#130).
 */
import { INestApplication } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ApiHelper } from './helpers/api-client.helper';
import { createTestApp, getPrisma, uniqueSuffix } from './helpers/app.helper';
import { decimalEquals, midnightIso } from './helpers/journey.helper';
import { createAccount, SeededChart, seedChart, sumLines } from './helpers/postings.helper';
import { registerTenant, TestTenant } from './helpers/tenant.helper';
import { PrismaService } from '../src/prisma/prisma.service';

/** Month `offset` months from the current UTC month. */
function monthOf(offset: number): { month: number; year: number } {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1));
  return { month: d.getUTCMonth() + 1, year: d.getUTCFullYear() };
}

/** Last day of a month as YYYY-MM-DD (UTC). */
function monthEnd(p: { month: number; year: number }): string {
  return new Date(Date.UTC(p.year, p.month, 0)).toISOString().slice(0, 10);
}

describe('System postings through JournalsService (e2e) @issue-130', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  async function journalsFor(orgId: string, sourceType: string, sourceId?: string) {
    return prisma.journal.findMany({
      where: { organizationId: orgId, sourceType, ...(sourceId ? { sourceId } : {}) },
      include: { lines: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  function expectBalanced(lines: Array<{ debit: unknown; credit: unknown }>): void {
    const { debit, credit } = sumLines(lines);
    expect(debit.toFixed(4)).toBe(credit.toFixed(4));
    expect(debit.greaterThan(0)).toBe(true);
  }

  /** Exactly one request of a concurrent pair succeeds; the other is a clean 4xx. */
  function expectOneSuccess(statuses: number[]): void {
    expect(statuses.filter((s) => s >= 200 && s < 300)).toHaveLength(1);
    for (const s of statuses.filter((x) => x >= 300)) expect([400, 409]).toContain(s);
  }

  async function setLockDate(api: ApiHelper, lockDate: string | null): Promise<void> {
    const res = await api.patch('/organization/lock-date').send({ lockDate });
    expect(res.status).toBe(200);
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = getPrisma(app);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Payroll', () => {
    let tenant: TestTenant;
    let api: ApiHelper;
    let employeeId: string;
    const periodA = monthOf(-2);
    const periodB = monthOf(-3);

    async function processedRun(period: { month: number; year: number }): Promise<string> {
      const created = await api.post('/payroll/runs').send(period);
      expect(created.status).toBe(201);
      const calc = await api.post(`/payroll/runs/${created.body.id}/calculate`);
      expect(calc.status).toBe(201);
      return created.body.id as string;
    }

    beforeAll(async () => {
      tenant = await registerTenant(app, 'Payroll130');
      api = tenant.api;
      await seedChart(api);
      const employee = await prisma.employee.create({
        data: {
          employeeId: `E-${uniqueSuffix()}`,
          name: 'Payroll Employee',
          dateOfJoining: new Date(Date.UTC(2020, 0, 1)),
          basicSalary: new Prisma.Decimal('10000'),
          allowances: { housing: 333.33 },
          deductions: { loan: 100.25 },
          organizationId: tenant.organizationId,
        },
      });
      employeeId = employee.id;
      // Recorded through the API on the 1st: stored at local midnight, it counts for that month.
      const attendance = await api.post('/attendance').send({
        employeeId,
        date: `${periodA.year}-${String(periodA.month).padStart(2, '0')}-01`,
        status: 'PRESENT',
      });
      expect(attendance.status).toBe(201);
    });

    it('@e2e @flow:payroll @issue-130 AC-Decimal: payslip and run totals are exact (gross = net + deductions)', async () => {
      const runId = await processedRun(periodA);
      const slip = await prisma.payslip.findFirstOrThrow({
        where: { payrollRunId: runId, employeeId },
      });
      // 10000 / 22 x 1 day = 454.55 (currency scale); + 333.33 allowance; 15% tax rounded per
      // payslip; net absorbs the rest.
      expect(slip.grossSalary.toFixed(4)).toBe('787.8800');
      expect(slip.taxes.toFixed(4)).toBe('118.1800');
      expect(slip.netSalary.toFixed(4)).toBe('569.4500');
      expect(slip.netSalary.add(slip.taxes).add('100.25').toFixed(4)).toBe(
        slip.grossSalary.toFixed(4),
      );
      const run = await prisma.payrollRun.findUniqueOrThrow({ where: { id: runId } });
      expect(run.totalGross.toFixed(4)).toBe(run.totalNet.add(run.totalDeductions).toFixed(4));
      expect(run.totalDeductions.toFixed(4)).toBe('218.4300');
    });

    it('@e2e @flow:payroll @issue-130 AC1: paying a run twice concurrently posts one balanced PAYROLL journal dated on the period end', async () => {
      const run = await prisma.payrollRun.findFirstOrThrow({
        where: { organizationId: tenant.organizationId, ...periodA },
      });
      const results = await Promise.all([
        api.post(`/payroll/runs/${run.id}/paid`),
        api.post(`/payroll/runs/${run.id}/paid`),
      ]);
      expectOneSuccess(results.map((r) => r.status));

      const journals = await journalsFor(tenant.organizationId, 'PAYROLL', run.id);
      expect(journals).toHaveLength(1);
      expectBalanced(journals[0].lines);
      expect(journals[0].isPosted).toBe(true);
      expect(journals[0].date.toISOString()).toBe(midnightIso(monthEnd(periodA)));
      const paid = await prisma.payrollRun.findUniqueOrThrow({ where: { id: run.id } });
      expect(paid.status).toBe('PAID');
      expect(paid.journalId).toBe(journals[0].id);

      const again = await api.post(`/payroll/runs/${run.id}/paid`);
      expect(again.status).toBe(400);
      expect(await journalsFor(tenant.organizationId, 'PAYROLL', run.id)).toHaveLength(1);
    });

    it('@e2e @flow:payroll @issue-130 AC3: a lock date covering the period rejects the payroll posting', async () => {
      const runId = await processedRun(periodB);
      await setLockDate(api, midnightIso(monthEnd(periodB)));
      try {
        const res = await api.post(`/payroll/runs/${runId}/paid`);
        expect(res.status).toBe(400);
        expect(String(res.body.message)).toMatch(/locked/i);
      } finally {
        await setLockDate(api, null);
      }
      expect(await journalsFor(tenant.organizationId, 'PAYROLL', runId)).toHaveLength(0);
      const run = await prisma.payrollRun.findUniqueOrThrow({ where: { id: runId } });
      expect(run.status).toBe('PROCESSED');
    });

    it('@e2e @flow:payroll @issue-130 AC-SoftDelete: deleting a processed run soft-deletes its payslips', async () => {
      const run = await prisma.payrollRun.findFirstOrThrow({
        where: { organizationId: tenant.organizationId, ...periodB },
      });
      const res = await api.delete(`/payroll/runs/${run.id}`);
      expect(res.status).toBe(200);
      const slips = await prisma.payslip.findMany({ where: { payrollRunId: run.id } });
      expect(slips).toHaveLength(1);
      expect(slips[0]).toHaveProperty('deletedAt', expect.any(Date));
      const list = await api.get(`/payroll/payslips/employee/${employeeId}`);
      expect(list.status).toBe(200);
      expect(list.body.map((s: { id: string }) => s.id)).not.toContain(slips[0].id);
    });

    it('@e2e @flow:payroll @issue-130 AC-SoftDelete: a deleted processed run is recreated as a draft and recalculates', async () => {
      const deleted = await prisma.payrollRun.findFirstOrThrow({
        where: { organizationId: tenant.organizationId, ...periodB },
      });
      expect(deleted.deletedAt).not.toBeNull();

      const recreated = await api.post('/payroll/runs').send(periodB);
      expect(recreated.status).toBe(201);
      expect(recreated.body).toMatchObject({ id: deleted.id, status: 'DRAFT', processedAt: null });
      // The discarded payslip never reached the ledger and no longer holds the (run, employee) key.
      expect(await prisma.payslip.count({ where: { payrollRunId: deleted.id } })).toBe(0);

      const calc = await api.post(`/payroll/runs/${deleted.id}/calculate`);
      expect(calc.status).toBe(201);
      const slips = await prisma.payslip.findMany({ where: { payrollRunId: deleted.id } });
      expect(slips).toHaveLength(1);
      expect(slips[0].deletedAt).toBeNull();
      expect(await journalsFor(tenant.organizationId, 'PAYROLL', deleted.id)).toHaveLength(0);
    });

    it('@e2e @flow:payroll @issue-130 AC-SoftDelete: re-creating a draft run keeps the existing draft row', async () => {
      const period = monthOf(-4);
      const first = await api.post('/payroll/runs').send(period);
      expect(first.status).toBe(201);
      const second = await api.post('/payroll/runs').send(period);
      expect(second.status).toBe(201);
      expect(second.body.id).toBe(first.body.id);
      expect(await prisma.payrollRun.count({ where: { id: first.body.id } })).toBe(1);
    });
  });

  describe('Depreciation and disposal', () => {
    let tenant: TestTenant;
    let api: ApiHelper;
    let chart: SeededChart;
    let accounts: { asset: string; expense: string; accumulated: string };
    let assetId: string;
    const purchase = monthOf(-2);

    async function scheduleFor(id: string, p: { month: number; year: number }) {
      return prisma.depreciationSchedule.findFirstOrThrow({ where: { assetId: id, ...p } });
    }

    async function createAsset(price: number, usefulLifeYears = 1): Promise<string> {
      const res = await api.post('/assets').send({
        name: `Laptop ${uniqueSuffix()}`,
        assetType: 'ELECTRONICS',
        purchaseDate: `${purchase.year}-${String(purchase.month).padStart(2, '0')}-01`,
        purchasePrice: price,
        salvageValue: 0,
        usefulLifeYears,
        assetAccountId: accounts.asset,
        depreciationAccountId: accounts.expense,
        accumulatedDeprAccountId: accounts.accumulated,
      });
      expect(res.status).toBe(201);
      return res.body.id as string;
    }

    beforeAll(async () => {
      tenant = await registerTenant(app, 'Deprec130');
      api = tenant.api;
      chart = await seedChart(api);
      const byCode = async (code: string): Promise<string> =>
        (
          await prisma.account.findFirstOrThrow({
            where: { organizationId: tenant.organizationId, code },
          })
        ).id;
      accounts = {
        asset: await byCode('1510'),
        expense: await byCode('6700'),
        accumulated: await byCode('1600'),
      };
      assetId = await createAsset(1000);
    });

    it('@e2e @flow:depreciation @issue-130 AC-Decimal: a straight-line schedule sums exactly to the depreciable amount', async () => {
      const rows = await prisma.depreciationSchedule.findMany({
        where: { assetId },
        orderBy: [{ year: 'asc' }, { month: 'asc' }],
      });
      expect(rows).toHaveLength(12);
      const total = rows.reduce((s, r) => s.add(r.amount), new Prisma.Decimal(0));
      expect(total.toFixed(4)).toBe('1000.0000');
      expect(rows[0].amount.toFixed(4)).toBe('83.3300');
      expect(rows[11].amount.toFixed(4)).toBe('83.3700');
      expect(rows[11].accumulatedTotal.toFixed(4)).toBe('1000.0000');
      expect(rows[11].bookValue.toFixed(4)).toBe('0.0000');
    });

    it('@e2e @flow:depreciation @issue-130 AC3: a lock date covering the period rejects the depreciation posting', async () => {
      const schedule = await scheduleFor(assetId, purchase);
      await setLockDate(api, midnightIso(monthEnd(purchase)));
      try {
        const res = await api
          .post(`/assets/${assetId}/depreciate`)
          .query({ month: purchase.month, year: purchase.year });
        expect(res.status).toBe(400);
        expect(String(res.body.message)).toMatch(/locked/i);
      } finally {
        await setLockDate(api, null);
      }
      expect(await journalsFor(tenant.organizationId, 'DEPRECIATION', schedule.id)).toHaveLength(0);
      expect((await scheduleFor(assetId, purchase)).executedAt).toBeNull();
    });

    it('@e2e @flow:depreciation @issue-130 AC2: reversing depreciation keeps the original posted and creates a linked reversal', async () => {
      const period = monthOf(-1);
      const run = await api
        .post(`/assets/${assetId}/depreciate`)
        .query({ month: period.month, year: period.year });
      expect(run.status).toBe(200);
      const schedule = await scheduleFor(assetId, period);
      const [original] = await journalsFor(tenant.organizationId, 'DEPRECIATION', schedule.id);
      expect(original).toBeDefined();
      expectBalanced(original.lines);
      expect(original.date.toISOString()).toBe(midnightIso(monthEnd(period)));
      expect(schedule.journalId).toBe(original.id);

      const reversed = await api.post(`/assets/schedule/${schedule.id}/reverse`);
      expect(reversed.status).toBe(204);

      const after = await prisma.journal.findUniqueOrThrow({
        where: { id: original.id },
        include: { reversedBy: { include: { lines: true } } },
      });
      expect(after.isPosted).toBe(true);
      expect(after.reversedBy).not.toBeNull();
      expect(after.reversedBy!.isPosted).toBe(true);
      expectBalanced(after.reversedBy!.lines);
      const net = sumLines([...original.lines, ...after.reversedBy!.lines]);
      expect(net.debit.toFixed(4)).toBe(net.credit.toFixed(4));
      expect((await scheduleFor(assetId, period)).executedAt).toBeNull();

      const rerun = await api
        .post(`/assets/${assetId}/depreciate`)
        .query({ month: period.month, year: period.year });
      expect(rerun.status).toBe(200);
      const live = await prisma.journal.findMany({
        where: {
          organizationId: tenant.organizationId,
          sourceType: 'DEPRECIATION',
          sourceId: { startsWith: schedule.id },
          reversedBy: null,
        },
      });
      expect(live).toHaveLength(1);
    });

    it('@e2e @flow:depreciation @issue-130 AC1: manual and monthly runs of the same period post one DEPRECIATION journal', async () => {
      const period = monthOf(0);
      const schedule = await scheduleFor(assetId, period);
      const results = await Promise.all([
        api.post(`/assets/${assetId}/depreciate`).query(period),
        api.post('/assets/depreciation/run'),
      ]);
      for (const r of results) expect(r.status).toBeLessThan(500);

      const journals = await journalsFor(tenant.organizationId, 'DEPRECIATION', schedule.id);
      expect(journals).toHaveLength(1);
      expectBalanced(journals[0].lines);
      expect(journals[0].date.toISOString()).toBe(midnightIso(monthEnd(period)));

      const again = await api.post('/assets/depreciation/run');
      expect(again.status).toBe(200);
      expect(again.body.journalsCreated).toBe(0);
      expect(await journalsFor(tenant.organizationId, 'DEPRECIATION', schedule.id)).toHaveLength(1);
    });

    it('@e2e @flow:depreciation @issue-130 AC-Order: no period posts or reverses behind a later posted one', async () => {
      // monthOf(-1) and monthOf(0) are posted; the purchase month never was.
      const behind = await api.post(`/assets/${assetId}/depreciate`).query(purchase);
      expect(behind.status).toBe(400);
      expect(String(behind.body.message)).toMatch(/later/i);

      const previous = await scheduleFor(assetId, monthOf(-1));
      const reversed = await api.post(`/assets/schedule/${previous.id}/reverse`);
      expect(reversed.status).toBe(400);
      expect(String(reversed.body.message)).toMatch(/later/i);
      expect((await scheduleFor(assetId, monthOf(-1))).executedAt).not.toBeNull();
    });

    it('@e2e @flow:depreciation @issue-130 AC-Register: the asset register equals the posted depreciation', async () => {
      const posted = await prisma.depreciationSchedule.findMany({
        where: { assetId, executedAt: { not: null } },
        include: { journal: { include: { lines: true } } },
      });
      const ledger = posted
        .flatMap((row) => row.journal?.lines ?? [])
        .filter((line) => line.accountId === accounts.accumulated)
        .reduce((sum, line) => sum.add(line.credit), new Prisma.Decimal(0));
      const asset = await prisma.asset.findUniqueOrThrow({ where: { id: assetId } });
      // monthOf(-1) + monthOf(0): the unposted purchase month is not on the books.
      expect(asset.accumulatedDepreciation.toFixed(4)).toBe('166.6600');
      expect(asset.accumulatedDepreciation.toFixed(4)).toBe(ledger.toFixed(4));
      expect(asset.currentBookValue.toFixed(4)).toBe('833.3400');
    });

    it('@e2e @flow:depreciation @issue-130 AC-CatchUp: the monthly run posts the open periods after the latest posted one, oldest first', async () => {
      const id = await createAsset(1200);
      expect((await api.post(`/assets/${id}/depreciate`).query(purchase)).status).toBe(200);

      const run = await api.post('/assets/depreciation/run');
      expect(run.status).toBe(200);
      expect(run.body.journalsCreated).toBe(2);
      for (const period of [monthOf(-1), monthOf(0)]) {
        const schedule = await scheduleFor(id, period);
        const journals = await journalsFor(tenant.organizationId, 'DEPRECIATION', schedule.id);
        expect(journals).toHaveLength(1);
        expectBalanced(journals[0].lines);
        expect(journals[0].date.toISOString()).toBe(midnightIso(monthEnd(period)));
      }
      const asset = await prisma.asset.findUniqueOrThrow({ where: { id } });
      expect(asset.accumulatedDepreciation.toFixed(4)).toBe('300.0000'); // 3 x 1200 / 12
    });

    it('@e2e @flow:depreciation @issue-130 AC1: disposing twice concurrently posts one balanced ASSET_DISPOSAL journal with cash and loss lines', async () => {
      const disposedId = await createAsset(1000, 5);
      const disposalDate = `${purchase.year}-${String(purchase.month).padStart(2, '0')}-15`;
      const results = await Promise.all([
        api.post(`/assets/${disposedId}/dispose`).send({ disposalDate, disposalAmount: 600 }),
        api.post(`/assets/${disposedId}/dispose`).send({ disposalDate, disposalAmount: 600 }),
      ]);
      expectOneSuccess(results.map((r) => r.status));

      const journals = await journalsFor(tenant.organizationId, 'ASSET_DISPOSAL', disposedId);
      expect(journals).toHaveLength(1);
      const [journal] = journals;
      expectBalanced(journal.lines);
      expect(journal.date.toISOString()).toBe(midnightIso(disposalDate));
      const debit = (accountId: string) =>
        journal.lines.find((l) => l.accountId === accountId && !l.debit.isZero());
      expect(decimalEquals(debit(chart.cash)?.debit, '600')).toBe(true);
      expect(journal.lines.some((l) => decimalEquals(l.credit, '1000'))).toBe(true);
      const lossLine = journal.lines.find((l) => decimalEquals(l.debit, '400'));
      const lossAccount = await prisma.account.findUniqueOrThrow({
        where: { id: lossLine!.accountId },
      });
      expect(lossAccount.type).toBe('EXPENSE');
      expect(lossAccount.code).not.toBe('6100'); // Rent Expense
    });

    it('@e2e @flow:depreciation @issue-130 AC-GainLoss: a disposal gain is credited to an income account', async () => {
      const soldId = await createAsset(1000, 5);
      const disposalDate = `${purchase.year}-${String(purchase.month).padStart(2, '0')}-20`;
      const res = await api
        .post(`/assets/${soldId}/dispose`)
        .send({ disposalDate, disposalAmount: 1200 });
      expect(res.status).toBe(200);

      const [journal] = await journalsFor(tenant.organizationId, 'ASSET_DISPOSAL', soldId);
      expectBalanced(journal.lines);
      const gainLine = journal.lines.find((l) => decimalEquals(l.credit, '200'));
      const gainAccount = await prisma.account.findUniqueOrThrow({
        where: { id: gainLine!.accountId },
      });
      expect(['INCOME', 'REVENUE']).toContain(gainAccount.type);
    });

    it('@e2e @flow:depreciation @issue-130 AC-Dispose: a fully depreciated asset can be disposed of', async () => {
      const wornId = await createAsset(600);
      const periods = await prisma.depreciationSchedule.findMany({
        where: { assetId: wornId },
        orderBy: [{ year: 'asc' }, { month: 'asc' }],
      });
      for (const p of periods) {
        const res = await api
          .post(`/assets/${wornId}/depreciate`)
          .query({ month: p.month, year: p.year });
        expect(res.status).toBe(200);
      }
      const worn = await prisma.asset.findUniqueOrThrow({ where: { id: wornId } });
      expect(worn.status).toBe('FULLY_DEPRECIATED');
      expect(worn.currentBookValue.toFixed(4)).toBe('0.0000');

      const res = await api
        .post(`/assets/${wornId}/dispose`)
        .send({ disposalDate: monthEnd(periods[periods.length - 1]), disposalAmount: 0 });
      expect(res.status).toBe(200);
      const [journal] = await journalsFor(tenant.organizationId, 'ASSET_DISPOSAL', wornId);
      expectBalanced(journal.lines);
      expect(sumLines(journal.lines).debit.toFixed(4)).toBe('600.0000');
    });
  });

  describe('Manufacturing COGM', () => {
    let tenant: TestTenant;
    let api: ApiHelper;
    let bomId: string;
    let rawItemId: string;

    async function startedWorkOrder(): Promise<string> {
      const created = await api.post('/manufacturing/work-orders').send({ bomId, quantity: 1 });
      expect(created.status).toBe(201);
      const started = await api.post(`/manufacturing/work-orders/${created.body.id}/start`);
      expect(started.status).toBe(201);
      return created.body.id as string;
    }

    beforeAll(async () => {
      tenant = await registerTenant(app, 'Cogm130');
      api = tenant.api;
      await seedChart(api);
      const inventory = await createAccount(api, '1100', 'Inventory', 'ASSET');
      const orgId = tenant.organizationId;
      const warehouse = await prisma.warehouse.create({
        data: {
          name: 'Main',
          code: `WH-${uniqueSuffix()}`,
          isDefault: true,
          organizationId: orgId,
        },
      });
      const raw = await prisma.item.create({
        data: {
          name: 'Resin',
          sku: `RAW-${uniqueSuffix()}`,
          type: 'GOODS',
          costPrice: new Prisma.Decimal('3.3333'),
          inventoryAccountId: inventory,
          organizationId: orgId,
        },
      });
      rawItemId = raw.id;
      const output = await prisma.item.create({
        data: {
          name: 'Widget',
          sku: `OUT-${uniqueSuffix()}`,
          type: 'GOODS',
          inventoryAccountId: inventory,
          organizationId: orgId,
        },
      });
      await prisma.inventoryMovement.create({
        data: {
          itemId: raw.id,
          warehouseId: warehouse.id,
          type: 'purchase',
          movementType: 'IN',
          quantity: new Prisma.Decimal('10'),
          organizationId: orgId,
        },
      });
      const bom = await prisma.bOM.create({
        data: {
          name: 'Widget BOM',
          outputItemId: output.id,
          outputQuantity: 3,
          organizationId: orgId,
          items: { create: [{ itemId: raw.id, quantity: new Prisma.Decimal('1') }] },
        },
      });
      bomId = bom.id;
    });

    it('@e2e @flow:cogm @issue-130 AC1: completing a work order twice concurrently posts one balanced COGM journal with exact quantities', async () => {
      const workOrderId = await startedWorkOrder();
      const results = await Promise.all([
        api
          .post(`/manufacturing/work-orders/${workOrderId}/complete`)
          .send({ quantityProduced: 1 }),
        api
          .post(`/manufacturing/work-orders/${workOrderId}/complete`)
          .send({ quantityProduced: 1 }),
      ]);
      expectOneSuccess(results.map((r) => r.status));

      const journals = await journalsFor(tenant.organizationId, 'COGM', workOrderId);
      expect(journals).toHaveLength(1);
      expectBalanced(journals[0].lines);
      // 1 of 3 outputs consumes 0.3333 of the 1-unit input; x 3.3333 = 1.11 at currency scale.
      expect(sumLines(journals[0].lines).debit.toFixed(4)).toBe('1.1100');

      const consumed = await prisma.inventoryMovement.findMany({
        where: { referenceId: workOrderId, itemId: rawItemId, movementType: 'OUT' },
      });
      expect(consumed).toHaveLength(1);
      expect(consumed[0].quantity.toFixed(4)).toBe('0.3333');
      const wo = await prisma.workOrder.findUniqueOrThrow({ where: { id: workOrderId } });
      expect(wo.status).toBe('COMPLETED');
      expect(wo.journalId).toBe(journals[0].id);
    });

    it('@e2e @flow:cogm @issue-130 AC1: bulk completion posts one balanced COGM journal per work order and never repeats one', async () => {
      const ids = [await startedWorkOrder(), await startedWorkOrder()];
      const res = await api.post('/manufacturing/work-orders/bulk-complete').send({ ids });
      expect(res.status).toBe(201);
      expect(res.body).toEqual({ processed: 2, total: 2, failures: [] });
      for (const id of ids) {
        const journals = await journalsFor(tenant.organizationId, 'COGM', id);
        expect(journals).toHaveLength(1);
        expectBalanced(journals[0].lines);
        expect(sumLines(journals[0].lines).debit.toFixed(4)).toBe('1.1100');
        const wo = await prisma.workOrder.findUniqueOrThrow({ where: { id } });
        expect(wo).toMatchObject({ status: 'COMPLETED', journalId: journals[0].id });
      }

      const again = await api.post('/manufacturing/work-orders/bulk-complete').send({ ids });
      expect(again.body).toMatchObject({ processed: 0, total: 2 });
      expect(again.body.failures).toHaveLength(2);
      for (const id of ids) {
        expect(await journalsFor(tenant.organizationId, 'COGM', id)).toHaveLength(1);
      }
    });

    it('@e2e @flow:cogm @issue-130 AC3: a lock date covering the completion date rejects the COGM posting and moves no stock', async () => {
      const workOrderId = await startedWorkOrder();
      const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
      await setLockDate(api, midnightIso(tomorrow));
      try {
        const res = await api
          .post(`/manufacturing/work-orders/${workOrderId}/complete`)
          .send({ quantityProduced: 1 });
        expect(res.status).toBe(400);
        expect(String(res.body.message)).toMatch(/locked/i);
      } finally {
        await setLockDate(api, null);
      }
      expect(await journalsFor(tenant.organizationId, 'COGM', workOrderId)).toHaveLength(0);
      expect(await prisma.inventoryMovement.count({ where: { referenceId: workOrderId } })).toBe(0);
      const wo = await prisma.workOrder.findUniqueOrThrow({ where: { id: workOrderId } });
      expect(wo.status).toBe('IN_PROCESS');
    });
  });
});
