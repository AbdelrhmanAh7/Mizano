/**
 * Work-order completion is one transaction: the status change, the material and finished-goods
 * movements and the COGM journal commit together or not at all, and a retry or a concurrent
 * completion posts nothing a second time. Real registered users, real JWTs, exact decimal
 * assertions (see helpers/tenant.helper.ts).
 */
import { INestApplication } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ApiHelper } from './helpers/api-client.helper';
import { createTestApp, getPrisma, uniqueSuffix } from './helpers/app.helper';
import { isoDay } from './helpers/journey.helper';
import { createAccount, sumLines } from './helpers/postings.helper';
import { registerTenant, TestTenant } from './helpers/tenant.helper';
import { PrismaService } from '../src/prisma/prisma.service';
import { WorkOrdersService } from '../src/modules/manufacturing/services/work-orders.service';

const D = (v: unknown): Prisma.Decimal => new Prisma.Decimal(String(v));

describe('Work order completion (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantA: TestTenant;
  let tenantB: TestTenant;
  let a: ApiHelper;
  let b: ApiHelper;
  let bomId = '';

  async function newWorkOrder(): Promise<string> {
    const created = await a.post('/manufacturing/work-orders').send({ bomId, quantity: 5 });
    expect(created.status).toBe(201);
    const started = await a.post(`/manufacturing/work-orders/${created.body.id}/start`);
    expect(started.status).toBe(201);
    return created.body.id as string;
  }

  const complete = (id: string, api: ApiHelper = a) =>
    api.post(`/manufacturing/work-orders/${id}/complete`).send({ quantityProduced: 5 });

  const movementsOf = (id: string) =>
    prisma.inventoryMovement.findMany({
      where: {
        organizationId: tenantA.organizationId,
        referenceType: 'workOrder',
        referenceId: id,
      },
    });

  const workOrder = (id: string) =>
    prisma.workOrder.findFirstOrThrow({
      where: { id, organizationId: tenantA.organizationId },
    });

  const cogmJournals = (workOrderNumber: string) =>
    prisma.journal.findMany({
      where: { organizationId: tenantA.organizationId, reference: `COGM-${workOrderNumber}` },
      include: { lines: true },
    });

  beforeAll(async () => {
    app = await createTestApp();
    prisma = getPrisma(app);
    tenantA = await registerTenant(app, 'MfgA');
    tenantB = await registerTenant(app, 'MfgB');
    a = tenantA.api;
    b = tenantB.api;

    const rawAccount = await createAccount(a, '1210', 'Raw Material Inventory', 'ASSET');
    const finishedAccount = await createAccount(a, '1220', 'Finished Goods', 'ASSET');
    await createAccount(a, '6800', 'Manufacturing Overhead Applied', 'EXPENSE');
    const offset = await createAccount(a, '6700', 'Inventory Shrinkage', 'EXPENSE');
    const warehouse = await a
      .post('/warehouses')
      .send({ code: `WH-${uniqueSuffix()}`, name: 'Plant', isDefault: true });
    expect(warehouse.status).toBe(201);

    const item = async (name: string, costPrice: string, inventoryAccountId: string) => {
      const res = await a.post('/items').send({
        name,
        sku: `SKU-${uniqueSuffix()}`,
        type: 'GOODS',
        unit: 'PCS',
        sellingPrice: '10.00',
        costPrice,
        inventoryAccountId,
      });
      expect(res.status).toBe(201);
      return res.body.id as string;
    };
    const raw = await item('Steel', '3.50', rawAccount);
    const finished = await item('Frame', '0', finishedAccount);
    const stock = await a.post('/inventory-adjustments').send({
      date: isoDay(-10),
      warehouseId: warehouse.body.id,
      itemId: raw,
      type: 'INCREASE',
      quantity: 100,
      reason: 'STOCKTAKE',
      accountId: offset,
    });
    expect(stock.status).toBe(201);

    // One frame needs 2 steel (3.50 each) and 2.00 of operations cost.
    const bom = await a.post('/manufacturing/bom').send({
      name: 'Frame',
      outputItemId: finished,
      outputQuantity: 1,
      operationsCost: '2.00',
      components: [{ itemId: raw, quantity: 2 }],
    });
    expect(bom.status).toBe(201);
    bomId = bom.body.id as string;
  });

  afterAll(async () => {
    await app.close();
  });

  it('two concurrent completions post the stock movements and the journal exactly once', async () => {
    const id = await newWorkOrder();

    const [first, second] = await Promise.all([complete(id), complete(id)]);

    expect([first.status, second.status].sort()).toEqual([201, 400]);
    const loser = first.status === 400 ? first : second;
    expect(loser.body.message).toBe('Work order is not in process');

    const moves = await movementsOf(id);
    expect(moves).toHaveLength(2);
    const quantity = (type: 'IN' | 'OUT') =>
      moves.filter((m) => m.movementType === type).map((m) => D(m.quantity).toString());
    expect(quantity('OUT')).toEqual(['10']);
    expect(quantity('IN')).toEqual(['5']);

    const done = await workOrder(id);
    expect(done.status).toBe('COMPLETED');
    expect(done.completedDate).not.toBeNull();
    const journals = await cogmJournals(done.workOrderNumber);
    expect(journals).toHaveLength(1);
    expect(done.journalId).toBe(journals[0].id);
    // 10 steel at 3.50 plus 2.00 of operations cost, balanced.
    const total = sumLines(journals[0].lines);
    expect(total.debit.equals('37')).toBe(true);
    expect(total.credit.equals('37')).toBe(true);
  });

  it('a retry of a completed work order changes nothing', async () => {
    const id = await newWorkOrder();
    expect((await complete(id)).status).toBe(201);

    const retry = await complete(id);

    expect(retry.status).toBe(400);
    expect(await movementsOf(id)).toHaveLength(2);
    expect(await cogmJournals((await workOrder(id)).workOrderNumber)).toHaveLength(1);
    // A completed work order is not cancelled over either.
    expect(
      (await a.post(`/manufacturing/work-orders/${id}/cancel`).send({ reason: 'x' })).status,
    ).toBe(400);
    expect((await workOrder(id)).status).toBe('COMPLETED');
  });

  it('a failure after the stock movements rolls everything back, and the retry posts once', async () => {
    const id = await newWorkOrder();
    const spy = jest
      .spyOn(
        app.get(WorkOrdersService) as unknown as {
          createCOGMJournal: () => Promise<string | null>;
        },
        'createCOGMJournal',
      )
      .mockRejectedValueOnce(new Error('journal failed'));

    const failed = await complete(id);
    spy.mockRestore();

    expect(failed.status).toBe(500);
    const open = await workOrder(id);
    expect(open.status).toBe('IN_PROCESS');
    expect(open.completedDate).toBeNull();
    expect(open.journalId).toBeNull();
    // The material and finished-goods movements written before the failure were rolled back.
    expect(await movementsOf(id)).toHaveLength(0);
    expect(await cogmJournals(open.workOrderNumber)).toHaveLength(0);

    const retry = await complete(id);
    expect(retry.status).toBe(201);
    expect(await movementsOf(id)).toHaveLength(2);
    expect(await cogmJournals(open.workOrderNumber)).toHaveLength(1);
  });

  it("is a 404 for another tenant's work order and posts nothing", async () => {
    const id = await newWorkOrder();

    const res = await complete(id, b);

    expect(res.status).toBe(404);
    expect((await workOrder(id)).status).toBe('IN_PROCESS');
    expect(await movementsOf(id)).toHaveLength(0);
  });

  it('records production only while the work order is in process', async () => {
    const id = await newWorkOrder();
    const entry = await a
      .post(`/manufacturing/work-orders/${id}/production`)
      .send({ quantityProduced: 2 });
    expect(entry.status).toBe(201);
    // The entry and its two stock movements commit together.
    expect(await movementsOf(id)).toHaveLength(2);
    expect(await prisma.productionEntry.count({ where: { workOrderId: id } })).toBe(1);

    expect((await complete(id)).status).toBe(201);
    const late = await a
      .post(`/manufacturing/work-orders/${id}/production`)
      .send({ quantityProduced: 1 });
    expect(late.status).toBe(400);
    expect(await prisma.productionEntry.count({ where: { workOrderId: id } })).toBe(1);
    expect(await movementsOf(id)).toHaveLength(4);
  });

  it('a cancelled work order cannot be completed', async () => {
    const id = await newWorkOrder();
    expect(
      (await a.post(`/manufacturing/work-orders/${id}/cancel`).send({ reason: 'no demand' }))
        .status,
    ).toBe(201);

    const res = await complete(id);

    expect(res.status).toBe(400);
    expect((await workOrder(id)).status).toBe('CANCELLED');
    expect(await movementsOf(id)).toHaveLength(0);
  });
});
