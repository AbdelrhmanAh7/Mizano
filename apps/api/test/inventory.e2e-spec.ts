/**
 * Inventory adjustments post to the ledger atomically: stock, movement and one balanced journal
 * move together, a void restores stock and reverses the journal, and tenants are isolated.
 * Real registered users, real JWTs, exact decimal assertions (see helpers/tenant.helper.ts).
 */
import { INestApplication } from '@nestjs/common';
import { ApiHelper } from './helpers/api-client.helper';
import { createTestApp, getPrisma, uniqueSuffix } from './helpers/app.helper';
import { decimalEquals, isoDay, lineSignature } from './helpers/journey.helper';
import { accountBalance, createAccount, dbLines, sumLines } from './helpers/postings.helper';
import { registerTenant, TestTenant } from './helpers/tenant.helper';
import { PrismaService } from '../src/prisma/prisma.service';

const ADJUSTMENT = 'INVENTORY_ADJUSTMENT';
const ADJUSTMENT_VOID = 'INVENTORY_ADJUSTMENT_VOID';

interface Fixture {
  inventoryAccountId: string;
  expenseAccountId: string;
  warehouseId: string;
  itemId: string;
}

describe('Inventory adjustments (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantA: TestTenant;
  let tenantB: TestTenant;
  let a: ApiHelper;
  let b: ApiHelper;
  let anon: ApiHelper;
  let fa: Fixture;
  let fb: Fixture;

  async function setup(api: ApiHelper, label: string, orgId: string): Promise<Fixture> {
    const inventoryAccountId = await createAccount(api, '1400', 'Inventory', 'ASSET');
    const expenseAccountId = await createAccount(api, '6700', 'Inventory Shrinkage', 'EXPENSE');
    const wh = await api
      .post('/warehouses')
      .send({ code: `WH-${uniqueSuffix()}`, name: `${label} WH` });
    expect(wh.status).toBe(201);
    const item = await api.post('/items').send({
      name: `${label} Widget`,
      sku: `SKU-${uniqueSuffix()}`,
      type: 'GOODS',
      unit: 'PCS',
      sellingPrice: '100.00',
      costPrice: '60.25',
      inventoryAccountId,
      openingStock: 10,
    });
    expect(item.status).toBe(201);
    // Allocate the opening stock to the warehouse: decreases need a stock level there.
    await prisma.inventoryLevel.create({
      data: { itemId: item.body.id, warehouseId: wh.body.id, quantity: 10, organizationId: orgId },
    });
    return { inventoryAccountId, expenseAccountId, warehouseId: wh.body.id, itemId: item.body.id };
  }

  const payload = (f: Fixture, over: Record<string, unknown> = {}): Record<string, unknown> => ({
    date: isoDay(-3),
    warehouseId: f.warehouseId,
    itemId: f.itemId,
    type: 'DECREASE',
    quantity: 3,
    reason: 'DAMAGED',
    accountId: f.expenseAccountId,
    ...over,
  });

  async function stockOf(api: ApiHelper, itemId: string): Promise<number> {
    const res = await api.get(`/items/${itemId}`);
    expect(res.status).toBe(200);
    return Number(res.body.currentStock);
  }

  async function journalsFor(orgId: string, sourceType: string, sourceId: string) {
    return prisma.journal.findMany({
      where: { organizationId: orgId, sourceType, sourceId },
      include: { lines: true },
    });
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = getPrisma(app);
    anon = ApiHelper.anonymous(app);
    tenantA = await registerTenant(app, 'InvA');
    tenantB = await registerTenant(app, 'InvB');
    a = tenantA.api;
    b = tenantB.api;
    fa = await setup(a, 'A', tenantA.organizationId);
    fb = await setup(b, 'B', tenantB.organizationId);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('tenant A', () => {
    let decreaseId = '';
    let increaseId = '';

    it('posts a decrease as one balanced journal and reduces stock (60.25 x 3 = 180.75)', async () => {
      const res = await a.post('/inventory-adjustments').send(payload(fa));
      expect(res.status).toBe(201);
      decreaseId = res.body.id;
      expect(res.body.status).toBe('POSTED');
      expect(res.body.adjustmentNumber).toMatch(/^ADJ-\d{3,}$/);
      expect(decimalEquals(res.body.value, '180.75')).toBe(true);

      expect(await stockOf(a, fa.itemId)).toBe(7);

      const journals = await journalsFor(tenantA.organizationId, ADJUSTMENT, decreaseId);
      expect(journals).toHaveLength(1);
      const [journal] = journals;
      expect(journal.isPosted).toBe(true);
      expect(journal.date.toISOString().slice(0, 10)).toBe(isoDay(-3));
      const totals = sumLines(journal.lines);
      expect(totals.debit.equals('180.75')).toBe(true);
      expect(totals.credit.equals('180.75')).toBe(true);
      expect(lineSignature(dbLines(journal.lines))).toEqual(
        lineSignature([
          { accountId: fa.expenseAccountId, debit: '180.75', credit: '0' },
          { accountId: fa.inventoryAccountId, debit: '0', credit: '180.75' },
        ]),
      );

      const movements = await prisma.inventoryMovement.findMany({
        where: { organizationId: tenantA.organizationId, referenceId: decreaseId },
      });
      expect(movements).toHaveLength(1);
      expect(Number(movements[0].quantity)).toBe(3); // direction is movementType
      expect(movements[0].movementType).toBe('OUT');
    });

    it('dates the movement on the adjustment date and carries the unit cost', async () => {
      const [movement] = await prisma.inventoryMovement.findMany({
        where: { organizationId: tenantA.organizationId, referenceId: decreaseId },
      });
      expect(movement.createdAt.toISOString().slice(0, 10)).toBe(isoDay(-3));
      expect(movement.costPerUnit.toString()).toBe('60.25');
    });

    it('rejects a decrease from a warehouse that holds no stock of the item', async () => {
      const other = await a
        .post('/warehouses')
        .send({ code: `WH-${uniqueSuffix()}`, name: 'Empty WH' });
      expect(other.status).toBe(201);
      const before = await stockOf(a, fa.itemId);
      const res = await a
        .post('/inventory-adjustments')
        .send(payload(fa, { warehouseId: other.body.id, quantity: 1 }));
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/Insufficient stock .* in this warehouse/);
      expect(await stockOf(a, fa.itemId)).toBe(before);
    });

    it('reads the adjustment back with its ledger status', async () => {
      const res = await a.get(`/inventory-adjustments/${decreaseId}`);
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('POSTED');
      expect(res.body.journalId).toEqual(expect.any(String));
      expect(res.body.item.id).toBe(fa.itemId);
      const list = await a.get('/inventory-adjustments').query({ limit: 50 });
      expect(list.status).toBe(200);
      expect(list.body.data.map((x: { id: string }) => x.id)).toContain(decreaseId);
    });

    it('posts an increase (Dr inventory, Cr adjustment account) and raises stock', async () => {
      const res = await a
        .post('/inventory-adjustments')
        .send(payload(fa, { type: 'INCREASE', quantity: 2, reason: 'STOCKTAKE' }));
      expect(res.status).toBe(201);
      increaseId = res.body.id;
      expect(decimalEquals(res.body.value, '120.5')).toBe(true);
      expect(await stockOf(a, fa.itemId)).toBe(9);
      const journals = await journalsFor(tenantA.organizationId, ADJUSTMENT, increaseId);
      expect(journals).toHaveLength(1);
      expect(lineSignature(dbLines(journals[0].lines))).toEqual(
        lineSignature([
          { accountId: fa.inventoryAccountId, debit: '120.5', credit: '0' },
          { accountId: fa.expenseAccountId, debit: '0', credit: '120.5' },
        ]),
      );
    });

    it('rejects invalid adjustments without any stock or ledger effect', async () => {
      const before = await prisma.journal.count({
        where: { organizationId: tenantA.organizationId },
      });
      const tooMany = await a.post('/inventory-adjustments').send(payload(fa, { quantity: 1000 }));
      expect(tooMany.status).toBe(400);
      expect(tooMany.body.message).toMatch(/Insufficient stock/);
      expect(
        (await a.post('/inventory-adjustments').send(payload(fa, { quantity: 0 }))).status,
      ).toBe(400);
      expect(
        (await a.post('/inventory-adjustments').send(payload(fa, { quantity: 1.5 }))).status,
      ).toBe(400);
      expect(
        (await a.post('/inventory-adjustments').send(payload(fa, { reason: 'NOPE' }))).status,
      ).toBe(400);
      const sameAccount = await a
        .post('/inventory-adjustments')
        .send(payload(fa, { accountId: fa.inventoryAccountId }));
      expect(sameAccount.status).toBe(400);
      expect(await stockOf(a, fa.itemId)).toBe(9);
      expect(
        await prisma.journal.count({ where: { organizationId: tenantA.organizationId } }),
      ).toBe(before);
    });

    it('voids an adjustment: stock restored, linked reversal, second void rejected', async () => {
      const res = await a.post(`/inventory-adjustments/${decreaseId}/void`).send({});
      expect(res.status).toBe(201);
      expect(res.body.status).toBe('VOIDED');
      expect(await stockOf(a, fa.itemId)).toBe(12);

      const [original] = await journalsFor(tenantA.organizationId, ADJUSTMENT, decreaseId);
      const reversals = await journalsFor(tenantA.organizationId, ADJUSTMENT_VOID, decreaseId);
      expect(reversals).toHaveLength(1);
      expect(reversals[0].reversalOfId).toBe(original.id);
      expect(lineSignature(dbLines(reversals[0].lines))).toEqual(
        lineSignature([
          { accountId: fa.expenseAccountId, debit: '0', credit: '180.75' },
          { accountId: fa.inventoryAccountId, debit: '180.75', credit: '0' },
        ]),
      );

      const voidMovements = await prisma.inventoryMovement.findMany({
        where: {
          organizationId: tenantA.organizationId,
          referenceId: decreaseId,
          type: 'adjustment_void',
        },
      });
      expect(voidMovements).toHaveLength(1);
      expect(voidMovements[0].costPerUnit.toString()).toBe('60.25');
      expect(voidMovements[0].createdAt.toISOString().slice(0, 10)).toBe(isoDay(0));

      const again = await a.post(`/inventory-adjustments/${decreaseId}/void`).send({});
      expect(again.status).toBe(400);
      expect(await stockOf(a, fa.itemId)).toBe(12);
      expect(await journalsFor(tenantA.organizationId, ADJUSTMENT_VOID, decreaseId)).toHaveLength(
        1,
      );

      const read = await a.get(`/inventory-adjustments/${decreaseId}`);
      expect(read.body.status).toBe('VOIDED');
    });

    it('keeps the ledger balanced and inventory equal to the net adjustments', async () => {
      // Only the increase (120.50) is still in force; the decrease was reversed.
      expect(
        (await accountBalance(prisma, tenantA.organizationId, fa.inventoryAccountId)).equals(
          '120.5',
        ),
      ).toBe(true);
      const tb = await a.get('/accounting-reports/trial-balance');
      expect(tb.status).toBe(200);
      expect(tb.body.totals.totalDebits).toBe(tb.body.totals.totalCredits);
    });

    it('posts exactly one reversal when the same void is sent concurrently', async () => {
      const created = await a.post('/inventory-adjustments').send(payload(fa, { quantity: 1 }));
      expect(created.status).toBe(201);
      const results = await Promise.all([
        a.post(`/inventory-adjustments/${created.body.id}/void`).send({}),
        a.post(`/inventory-adjustments/${created.body.id}/void`).send({}),
      ]);
      expect(results.filter((r) => r.status === 201)).toHaveLength(1);
      expect(results.filter((r) => r.status === 400 || r.status === 409)).toHaveLength(1);
      expect(
        await journalsFor(tenantA.organizationId, ADJUSTMENT_VOID, created.body.id),
      ).toHaveLength(1);
    });
  });

  describe('tenant isolation', () => {
    let adjustmentId = '';

    beforeAll(async () => {
      const res = await a.post('/inventory-adjustments').send(payload(fa, { quantity: 1 }));
      expect(res.status).toBe(201);
      adjustmentId = res.body.id;
    });

    it('tenant B cannot read, list or void tenant A adjustments', async () => {
      expect((await b.get(`/inventory-adjustments/${adjustmentId}`)).status).toBe(404);
      const list = await b.get('/inventory-adjustments').query({ limit: 100 });
      expect(list.status).toBe(200);
      expect(list.body.data.map((x: { id: string }) => x.id)).not.toContain(adjustmentId);
      expect((await b.post(`/inventory-adjustments/${adjustmentId}/void`).send({})).status).toBe(
        404,
      );
      const read = await a.get(`/inventory-adjustments/${adjustmentId}`);
      expect(read.body.status).toBe('POSTED');
    });

    it('tenant B cannot adjust tenant A items, warehouses or accounts', async () => {
      const before = await stockOf(a, fa.itemId);
      expect((await b.post('/inventory-adjustments').send(payload(fa))).status).toBe(400);
      expect(
        (await b.post('/inventory-adjustments').send(payload(fb, { itemId: fa.itemId }))).status,
      ).toBe(400);
      expect(
        (await b.post('/inventory-adjustments').send(payload(fb, { warehouseId: fa.warehouseId })))
          .status,
      ).toBe(400);
      expect(
        (
          await b
            .post('/inventory-adjustments')
            .send(payload(fb, { accountId: fa.expenseAccountId }))
        ).status,
      ).toBe(400);
      expect(await stockOf(a, fa.itemId)).toBe(before);
      expect(
        await prisma.journal.count({ where: { organizationId: tenantB.organizationId } }),
      ).toBe(0);
    });

    it('lists adjustment account options per tenant (expense accounts only)', async () => {
      const res = await a.get('/inventory-adjustments/account-options');
      expect(res.status).toBe(200);
      const ids = res.body.map((x: { id: string }) => x.id);
      expect(ids).toContain(fa.expenseAccountId);
      expect(ids).not.toContain(fa.inventoryAccountId);
      expect(ids).not.toContain(fb.expenseAccountId);
      const other = await b.get('/inventory-adjustments/account-options');
      expect(other.body.map((x: { id: string }) => x.id)).toEqual([fb.expenseAccountId]);
      expect((await anon.get('/inventory-adjustments/account-options')).status).toBe(401);
    });

    it('rejects a non-expense adjustment account', async () => {
      const equity = await createAccount(a, '3500', 'Misc equity', 'EQUITY');
      const res = await a.post('/inventory-adjustments').send(payload(fa, { accountId: equity }));
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/expense account/);
    });

    it('tenant B can adjust its own stock without touching tenant A', async () => {
      const res = await b.post('/inventory-adjustments').send(payload(fb, { quantity: 2 }));
      expect(res.status).toBe(201);
      expect(await stockOf(b, fb.itemId)).toBe(8);
    });

    it('rejects anonymous callers', async () => {
      expect((await anon.get('/inventory-adjustments')).status).toBe(401);
      expect((await anon.post('/inventory-adjustments').send(payload(fa))).status).toBe(401);
      expect((await anon.post(`/inventory-adjustments/${adjustmentId}/void`).send({})).status).toBe(
        401,
      );
    });
  });
});
