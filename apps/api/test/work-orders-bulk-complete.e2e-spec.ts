/**
 * @issue-165 Bulk completion of work orders runs the single completeWorkOrder command: materials out,
 * finished goods in and the COGM journal, at each order's planned quantity, with failures per order.
 */
import { INestApplication } from '@nestjs/common';
import { ApiHelper } from './helpers/api-client.helper';
import { createTestApp } from './helpers/app.helper';
import { createAccount } from './helpers/postings.helper';
import { registerTenant } from './helpers/tenant.helper';

const WO = '/manufacturing/work-orders';

interface JournalLine {
  accountId: string;
  debit: string;
  credit: string;
}

const signature = (lines: JournalLine[]): string[] =>
  lines
    .map((l) => `${l.accountId}|${Number(l.debit).toFixed(4)}|${Number(l.credit).toFixed(4)}`)
    .sort();

describe('Work orders bulk complete (e2e) @issue-165', () => {
  let app: INestApplication;
  let api: ApiHelper;
  let inventoryId: string;
  let componentId: string;
  let outputId: string;
  let bomId: string;

  async function workOrder(quantity: number, start = true): Promise<string> {
    const created = await api.post(WO).send({ bomId, quantity });
    expect(created.status).toBe(201);
    if (start) expect((await api.post(`${WO}/${created.body.id}/start`)).status).toBe(201);
    return created.body.id;
  }

  async function journalOf(id: string): Promise<string[]> {
    const wo = await api.get(`${WO}/${id}`);
    expect(wo.body.status).toBe('COMPLETED');
    expect(wo.body.journalId).toBeTruthy();
    const journal = await api.get(`/journals/${wo.body.journalId}`);
    expect(journal.status).toBe(200);
    return signature(journal.body.lines);
  }

  beforeAll(async () => {
    app = await createTestApp();
    api = (await registerTenant(app, 'Bulk165')).api;
    inventoryId = await createAccount(api, '1490', 'E2E Inventory', 'ASSET');
    const shrinkage = await createAccount(api, '6790', 'E2E Shrinkage', 'EXPENSE');
    const wh = await api.post('/warehouses').send({ code: 'WH165', name: 'Main', isDefault: true });
    expect(wh.status).toBe(201);
    const warehouseId: string = wh.body.id;
    const item = async (sku: string, costPrice: string): Promise<string> => {
      const res = await api.post('/items').send({
        name: sku,
        sku,
        type: 'GOODS',
        sellingPrice: '50.00',
        costPrice,
        inventoryAccountId: inventoryId,
      });
      expect(res.status).toBe(201);
      return res.body.id;
    };
    componentId = await item('E2E-165-COMPONENT', '10.00');
    outputId = await item('E2E-165-OUTPUT', '0');
    const stocked = await api.post('/inventory-adjustments').send({
      date: '2026-03-10',
      warehouseId,
      itemId: componentId,
      type: 'INCREASE',
      quantity: 30,
      reason: 'STOCKTAKE',
      accountId: shrinkage,
    });
    expect(stocked.status).toBe(201);
    const bom = await api.post('/manufacturing/bom').send({
      name: 'E2E 165 BOM',
      outputItemId: outputId,
      outputQuantity: 1,
      operationsCost: '0',
      components: [{ itemId: componentId, quantity: 2 }],
    });
    expect(bom.status).toBe(201);
    bomId = bom.body.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('bulk completing 2 orders posts the same COGM journals as one by one', async () => {
    const [single, bulkA, bulkB] = [await workOrder(3), await workOrder(3), await workOrder(3)];
    expect((await api.post(`${WO}/${single}/complete`).send({ quantityProduced: 3 })).status).toBe(
      201,
    );

    const bulk = await api.post(`${WO}/bulk-complete`).send({ ids: [bulkA, bulkB] });
    expect(bulk.status).toBe(201);
    expect(bulk.body).toEqual({ processed: 2, total: 2, failures: [] });

    // 3 units x 2 components x cost 10 = 60 into finished goods, 60 out of raw materials.
    const reference = await journalOf(single);
    expect(reference).toContain(`${inventoryId}|60.0000|0.0000`);
    expect(reference.some((sig) => sig.endsWith('|0.0000|60.0000'))).toBe(true);
    expect(await journalOf(bulkA)).toEqual(reference);
    expect(await journalOf(bulkB)).toEqual(reference);
  });

  it('reports failures per order and completes only the in-process ones', async () => {
    const [ok, draft] = [await workOrder(3), await workOrder(1, false)];
    const res = await api.post(`${WO}/bulk-complete`).send({ ids: [ok, draft, 'wo-ghost-165'] });

    expect(res.status).toBe(201);
    expect(res.body.processed).toBe(1);
    expect(res.body.total).toBe(3);
    expect(res.body.failures).toEqual(
      expect.arrayContaining([
        { id: draft, reason: 'Work order is not in process' },
        { id: 'wo-ghost-165', reason: 'Work order not found' },
      ]),
    );
    expect((await api.get(`${WO}/${draft}`)).body.status).toBe('DRAFT');
    expect(await journalOf(ok)).toContain(`${inventoryId}|60.0000|0.0000`);
  });

  it('rejects an empty selection', async () => {
    expect((await api.post(`${WO}/bulk-complete`).send({ ids: [] })).status).toBe(400);
  });

  it('produced the planned quantities and the trial balance still balances', async () => {
    // 4 orders completed at 3 units each: 12 output units in, 24 components out.
    const moves = await api.get('/inventory-movements').query({ type: 'production', limit: 100 });
    const rows: Array<{ itemId: string; movementType: string; quantity: unknown }> =
      moves.body.data;
    const moved = (id: string, dir: string): number =>
      rows
        .filter((m) => m.itemId === id && m.movementType === dir)
        .reduce((sum, m) => sum + Number(m.quantity), 0);
    expect(moved(outputId, 'IN')).toBe(12);
    expect(moved(componentId, 'OUT')).toBe(24);

    const tb = await api.get('/accounting-reports/trial-balance');
    expect(tb.status).toBe(200);
    expect(tb.body.totals.totalDebits).toBe(tb.body.totals.totalCredits);
  });
});
