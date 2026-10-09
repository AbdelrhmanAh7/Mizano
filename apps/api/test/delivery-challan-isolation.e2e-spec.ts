/**
 * Delivery challans never reach another tenant's master data (#131). Updating a draft with a
 * foreign customer, invoice, item or warehouse id is a 404 that changes nothing and echoes none
 * of the foreign names; issuing or returning a challan whose line points at a foreign item moves
 * no inventory. Cross-tenant path for the tenant-isolation suite of #108 (PR #124).
 */
import { INestApplication } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ApiHelper } from './helpers/api-client.helper';
import { createTestApp, getPrisma, uniqueSuffix } from './helpers/app.helper';
import { registerTenant, TestTenant } from './helpers/tenant.helper';
import { PrismaService } from '../src/prisma/prisma.service';

interface Fixture {
  customerId: string;
  customerName: string;
  invoiceId: string;
  itemId: string;
  itemName: string;
  warehouseId: string;
  warehouseName: string;
}

describe('Delivery challan tenant isolation (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantA: TestTenant;
  let tenantB: TestTenant;
  let b: ApiHelper;
  let fa: Fixture;
  let fb: Fixture;

  async function setup(t: TestTenant, label: string): Promise<Fixture> {
    const api = t.api;
    const customerName = `${label} Challan Customer ${uniqueSuffix()}`;
    const customer = await api.post('/customers').send({ name: customerName, currency: 'EGP' });
    expect(customer.status).toBe(201);
    const invoice = await api.post('/invoices').send({
      customerId: customer.body.id,
      date: new Date().toISOString(),
      dueDate: new Date(Date.now() + 30 * 86400000).toISOString(),
      lines: [{ description: 'Service', quantity: '1', rate: '100' }],
    });
    expect(invoice.status).toBe(201);
    const warehouseName = `${label} Challan WH ${uniqueSuffix()}`;
    const wh = await api
      .post('/warehouses')
      .send({ code: `WH-${uniqueSuffix()}`, name: warehouseName });
    expect(wh.status).toBe(201);
    const itemName = `${label} Challan Widget ${uniqueSuffix()}`;
    const item = await api.post('/items').send({
      name: itemName,
      sku: `SKU-${uniqueSuffix()}`,
      type: 'GOODS',
      unit: 'PCS',
      sellingPrice: '100.00',
      costPrice: '60.00',
    });
    expect(item.status).toBe(201);
    // Opening stock as ground truth so an unscoped issue() would find something to move.
    await prisma.inventoryLevel.create({
      data: {
        itemId: item.body.id,
        warehouseId: wh.body.id,
        quantity: new Prisma.Decimal(10),
        organizationId: t.organizationId,
      },
    });
    return {
      customerId: customer.body.id,
      customerName,
      invoiceId: invoice.body.id,
      itemId: item.body.id,
      itemName,
      warehouseId: wh.body.id,
      warehouseName,
    };
  }

  /** A draft challan of tenant B built only from B's own records. */
  async function createDraftB(): Promise<string> {
    const res = await b.post('/delivery-challans').send({
      customerId: fb.customerId,
      challanType: 'SUPPLY',
      date: new Date().toISOString(),
      lines: [{ itemId: fb.itemId, quantity: 2, warehouseId: fb.warehouseId }],
    });
    expect(res.status).toBe(201);
    return res.body.id as string;
  }

  /** Stands in for a challan written before #131: its line points at tenant A's item. */
  async function plantForeignLine(challanId: string, warehouseId: string): Promise<void> {
    await prisma.deliveryChallanLine.updateMany({
      where: { challanId },
      data: { itemId: fa.itemId, warehouseId },
    });
  }

  async function snapshot(challanId: string) {
    return prisma.deliveryChallan.findUniqueOrThrow({
      where: { id: challanId },
      select: {
        customerId: true,
        invoiceId: true,
        status: true,
        lines: { select: { itemId: true, warehouseId: true, quantity: true } },
      },
    });
  }

  /** Every trace a foreign-item movement would leave, in any organization. */
  async function foreignInventoryTrace() {
    const [movements, bLevels, aLevel] = await Promise.all([
      prisma.inventoryMovement.count({ where: { itemId: fa.itemId } }),
      prisma.inventoryLevel.count({
        where: { itemId: fa.itemId, organizationId: tenantB.organizationId },
      }),
      prisma.inventoryLevel.findFirstOrThrow({
        where: { itemId: fa.itemId, organizationId: tenantA.organizationId },
      }),
    ]);
    return { movements, bLevels, aQuantity: aLevel.quantity.toString() };
  }

  const leaksA = (text: string): boolean =>
    [fa.customerName, fa.itemName, fa.warehouseName].some((name) => text.includes(name));

  beforeAll(async () => {
    app = await createTestApp();
    prisma = getPrisma(app);
    tenantA = await registerTenant(app, 'ChallanA');
    tenantB = await registerTenant(app, 'ChallanB');
    b = tenantB.api;
    fa = await setup(tenantA, 'Alpha');
    fb = await setup(tenantB, 'Beta');
  });

  afterAll(async () => {
    await app.close();
  });

  describe('PUT /delivery-challans/:id', () => {
    it('@e2e @flow:delivery-challan @issue-131 AC1: rejects another tenant customerId with 404 and changes nothing', async () => {
      const id = await createDraftB();
      const before = await snapshot(id);
      const res = await b.put(`/delivery-challans/${id}`).send({ customerId: fa.customerId });
      expect(res.status).toBe(404);
      expect(leaksA(res.text)).toBe(false);
      expect(await snapshot(id)).toEqual(before);
    });

    it('@e2e @flow:delivery-challan @issue-131 AC1: rejects another tenant invoiceId with 404 and changes nothing', async () => {
      const id = await createDraftB();
      const before = await snapshot(id);
      const res = await b.put(`/delivery-challans/${id}`).send({ invoiceId: fa.invoiceId });
      expect(res.status).toBe(404);
      expect(await snapshot(id)).toEqual(before);
    });

    it('@e2e @flow:delivery-challan @issue-131 AC1: rejects another tenant itemId with 404 and keeps the existing lines', async () => {
      const id = await createDraftB();
      const before = await snapshot(id);
      const res = await b
        .put(`/delivery-challans/${id}`)
        .send({ lines: [{ itemId: fa.itemId, quantity: 1 }] });
      expect(res.status).toBe(404);
      expect(leaksA(res.text)).toBe(false);
      expect(await snapshot(id)).toEqual(before);
    });

    it('@e2e @flow:delivery-challan @issue-131 AC1: rejects another tenant warehouseId with 404 and keeps the existing lines', async () => {
      const id = await createDraftB();
      const before = await snapshot(id);
      const res = await b
        .put(`/delivery-challans/${id}`)
        .send({ lines: [{ itemId: fb.itemId, quantity: 1, warehouseId: fa.warehouseId }] });
      expect(res.status).toBe(404);
      expect(leaksA(res.text)).toBe(false);
      expect(await snapshot(id)).toEqual(before);
    });

    it('@e2e @flow:delivery-challan @issue-131 AC1: a foreign item update followed by issue creates no InventoryMovement', async () => {
      const id = await createDraftB();
      const trace = await foreignInventoryTrace();
      const put = await b
        .put(`/delivery-challans/${id}`)
        .send({ lines: [{ itemId: fa.itemId, quantity: 1 }] });
      expect(put.status).toBe(404);
      await b.post(`/delivery-challans/${id}/issue`);
      expect(await foreignInventoryTrace()).toEqual(trace);
    });

    it('@e2e @flow:delivery-challan @issue-131 AC1: still updates a draft with the caller own records', async () => {
      const id = await createDraftB();
      const res = await b.put(`/delivery-challans/${id}`).send({
        customerId: fb.customerId,
        invoiceId: fb.invoiceId,
        notes: 'own records',
        lines: [{ itemId: fb.itemId, quantity: 3, warehouseId: fb.warehouseId }],
      });
      expect(res.status).toBe(200);
      expect(res.body.invoice.id).toBe(fb.invoiceId);
      expect(res.body.lines).toHaveLength(1);
      expect(res.body.lines[0].item.id).toBe(fb.itemId);
      expect(res.body.lines[0].warehouse.id).toBe(fb.warehouseId);
    });
  });

  describe('POST /delivery-challans', () => {
    it('@e2e @flow:delivery-challan @issue-131 AC2: rejects another tenant warehouseId on create', async () => {
      const count = await prisma.deliveryChallan.count({
        where: { organizationId: tenantB.organizationId },
      });
      const res = await b.post('/delivery-challans').send({
        customerId: fb.customerId,
        challanType: 'SUPPLY',
        date: new Date().toISOString(),
        lines: [{ itemId: fb.itemId, quantity: 1, warehouseId: fa.warehouseId }],
      });
      expect(res.status).toBe(404);
      expect(leaksA(res.text)).toBe(false);
      expect(
        await prisma.deliveryChallan.count({ where: { organizationId: tenantB.organizationId } }),
      ).toBe(count);
    });
  });

  describe('issue and mark-returned', () => {
    it('@e2e @flow:delivery-challan @issue-131 AC3: issuing a challan whose line holds another tenant item is a 404 with no InventoryMovement', async () => {
      const id = await createDraftB();
      // A's warehouse: an unscoped stock check would read A's 10 units.
      await plantForeignLine(id, fa.warehouseId);
      const trace = await foreignInventoryTrace();
      const res = await b.post(`/delivery-challans/${id}/issue`);
      expect(res.status).toBe(404);
      expect(await foreignInventoryTrace()).toEqual(trace);
      expect((await snapshot(id)).status).toBe('DRAFT');
    });

    it('@e2e @flow:delivery-challan @issue-131 AC3: returning a challan whose line holds another tenant item is a 404 with no InventoryMovement', async () => {
      const id = await createDraftB();
      // B's warehouse: an unscoped return would open a B stock level for A's item.
      await plantForeignLine(id, fb.warehouseId);
      await prisma.deliveryChallan.update({ where: { id }, data: { status: 'ISSUED' } });
      const trace = await foreignInventoryTrace();
      const res = await b.post(`/delivery-challans/${id}/mark-returned`);
      expect(res.status).toBe(404);
      expect(await foreignInventoryTrace()).toEqual(trace);
      expect((await snapshot(id)).status).toBe('ISSUED');
    });

    it('@e2e @flow:delivery-challan @issue-131 AC3: issues and returns a challan of the caller own item', async () => {
      const id = await createDraftB();
      const issued = await b.post(`/delivery-challans/${id}/issue`);
      expect(issued.status).toBe(200);
      const returned = await b.post(`/delivery-challans/${id}/mark-returned`);
      expect(returned.status).toBe(200);
      const movements = await prisma.inventoryMovement.findMany({
        where: { itemId: fb.itemId, reference: { contains: issued.body.challanNumber } },
        select: { movementType: true, organizationId: true },
        orderBy: { createdAt: 'asc' },
      });
      expect(movements).toEqual([
        { movementType: 'OUT', organizationId: tenantB.organizationId },
        { movementType: 'IN', organizationId: tenantB.organizationId },
      ]);
    });
  });
});
