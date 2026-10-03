import { INestApplication } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ApiHelper } from './helpers/api-client.helper';
import { createTestApp, getPrisma, uniqueSuffix } from './helpers/app.helper';
import { isoDay } from './helpers/journey.helper';
import { createAccount, sumLines } from './helpers/postings.helper';
import { registerTenant, TestTenant } from './helpers/tenant.helper';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Bulk work-order completion posts production (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantA: TestTenant;
  let tenantB: TestTenant;
  let a: ApiHelper;
  let b: ApiHelper;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = getPrisma(app);
    tenantA = await registerTenant(app, 'WorkOrderA');
    tenantB = await registerTenant(app, 'WorkOrderB');
    a = tenantA.api;
    b = tenantB.api;
  });

  afterAll(async () => {
    await app.close();
  });

  it('uses planned quantity, posts stock and COGM once, and rejects cross-tenant ids', async () => {
    const inventoryAccountId = await createAccount(a, '1400', 'Finished Goods', 'ASSET');
    const rawMaterialsAccountId = await createAccount(a, '1401', 'Raw Materials', 'ASSET');
    const expenseAccountId = await createAccount(a, '6700', 'Inventory Adjustments', 'EXPENSE');
    const warehouse = await a
      .post('/warehouses')
      .send({ code: `WO-${uniqueSuffix()}`, name: 'Production', isDefault: true });
    expect(warehouse.status).toBe(201);

    const rawItem = await a.post('/items').send({
      name: 'Raw Material',
      sku: `RAW-${uniqueSuffix()}`,
      type: 'GOODS',
      unit: 'PCS',
      sellingPrice: '0',
      costPrice: '1.25',
      inventoryAccountId: rawMaterialsAccountId,
    });
    const finishedItem = await a.post('/items').send({
      name: 'Finished Goods',
      sku: `FG-${uniqueSuffix()}`,
      type: 'GOODS',
      unit: 'PCS',
      sellingPrice: '0',
      costPrice: '0',
      inventoryAccountId,
    });
    expect([rawItem.status, finishedItem.status]).toEqual([201, 201]);

    const openingStock = await a.post('/inventory-adjustments').send({
      date: isoDay(-10),
      warehouseId: warehouse.body.id,
      itemId: rawItem.body.id,
      type: 'INCREASE',
      quantity: 10,
      reason: 'STOCKTAKE',
      accountId: expenseAccountId,
    });
    expect(openingStock.status).toBe(201);

    const bom = await a.post('/manufacturing/bom').send({
      name: `Bulk BOM ${uniqueSuffix()}`,
      outputItemId: finishedItem.body.id,
      outputQuantity: 1,
      operationsCost: '0',
      components: [{ itemId: rawItem.body.id, quantity: '2' }],
    });
    expect(bom.status).toBe(201);
    const workOrder = await a.post('/manufacturing/work-orders').send({
      bomId: bom.body.id,
      quantity: 3,
    });
    expect(workOrder.status).toBe(201);
    expect((await a.post(`/manufacturing/work-orders/${workOrder.body.id}/start`)).status).toBe(
      201,
    );

    const completion = await a
      .post('/manufacturing/work-orders/bulk-complete')
      .send({ ids: [workOrder.body.id] });
    expect(completion.status).toBe(201);
    expect(completion.body).toEqual({ processed: 1, total: 1, failures: [] });

    const savedWorkOrder = await prisma.workOrder.findFirstOrThrow({
      where: { id: workOrder.body.id, organizationId: tenantA.organizationId },
    });
    expect(savedWorkOrder.status).toBe('COMPLETED');

    const movements = await prisma.inventoryMovement.findMany({
      where: { organizationId: tenantA.organizationId, referenceId: workOrder.body.id },
    });
    expect(movements).toHaveLength(2);
    const consumed = movements.find((movement) => movement.itemId === rawItem.body.id);
    const produced = movements.find((movement) => movement.itemId === finishedItem.body.id);
    expect(consumed?.movementType).toBe('OUT');
    expect(new Prisma.Decimal(String(consumed?.quantity)).equals('6')).toBe(true);
    expect(produced?.movementType).toBe('IN');
    expect(new Prisma.Decimal(String(produced?.quantity)).equals('3')).toBe(true);

    const journals = await prisma.journal.findMany({
      where: {
        organizationId: tenantA.organizationId,
        sourceType: 'WORK_ORDER_COMPLETION',
        sourceId: workOrder.body.id,
      },
      include: { lines: true },
    });
    expect(journals).toHaveLength(1);
    const totals = sumLines(journals[0].lines);
    expect(totals.debit.equals('7.5')).toBe(true);
    expect(totals.credit.equals('7.5')).toBe(true);
    const finishedGoodsLine = journals[0].lines.find(
      (line) => line.accountId === inventoryAccountId,
    );
    const rawMaterialsLine = journals[0].lines.find(
      (line) => line.accountId === rawMaterialsAccountId,
    );
    expect(finishedGoodsLine?.debit.equals('7.5')).toBe(true);
    expect(rawMaterialsLine?.credit.equals('7.5')).toBe(true);

    const retry = await a
      .post('/manufacturing/work-orders/bulk-complete')
      .send({ ids: [workOrder.body.id] });
    expect(retry.body).toMatchObject({ processed: 0, total: 1 });
    expect(retry.body.failures).toHaveLength(1);
    expect(
      await prisma.journal.count({
        where: {
          organizationId: tenantA.organizationId,
          sourceType: 'WORK_ORDER_COMPLETION',
          sourceId: workOrder.body.id,
        },
      }),
    ).toBe(1);

    const foreign = await b
      .post('/manufacturing/work-orders/bulk-complete')
      .send({ ids: [workOrder.body.id] });
    expect(foreign.status).toBe(201);
    expect(foreign.body).toMatchObject({ processed: 0, total: 1 });
    expect(foreign.body.failures[0]).toMatchObject({ id: workOrder.body.id });
    expect(
      await prisma.journal.count({
        where: { organizationId: tenantB.organizationId, sourceId: workOrder.body.id },
      }),
    ).toBe(0);
  });
});
