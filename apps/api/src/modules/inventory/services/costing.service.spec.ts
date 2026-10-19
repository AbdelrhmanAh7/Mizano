import { Test, TestingModule } from '@nestjs/testing';
import { Decimal } from '@prisma/client/runtime/library';
import { InventoryCostLayer, Prisma } from '@prisma/client';
import { CostingService } from './costing.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { createMockPrisma, MockPrismaClient } from '../../../test/mocks/prisma.mock';

// CostingService touches no Redis/cache, so only Prisma is mocked here.
const ORG = 'org-1';
const OTHER_ORG = 'org-2';
const ITEM = 'item-1';
const WH = 'wh-1';
const BASE_TIME = Date.UTC(2026, 0, 1);

type LayerWhere = {
  id?: string;
  organizationId?: string;
  itemId?: string;
  warehouseId?: string;
  referenceType?: string;
  referenceId?: string;
};

describe('CostingService', () => {
  let service: CostingService;
  let prisma: MockPrismaClient;
  let layers: InventoryCostLayer[];

  function layer(
    id: string,
    qty: string,
    cost: string,
    minute: number,
    over: Partial<InventoryCostLayer> = {},
  ): InventoryCostLayer {
    return {
      id,
      itemId: ITEM,
      warehouseId: WH,
      quantity: new Decimal(qty),
      originalQty: new Decimal(qty),
      costPerUnit: new Decimal(cost),
      referenceType: 'bill',
      referenceId: `bill-${id}`,
      organizationId: ORG,
      createdAt: new Date(BASE_TIME + minute * 60_000),
      ...over,
    };
  }

  const matches = (l: InventoryCostLayer, w: LayerWhere): boolean =>
    (Object.keys(w) as Array<keyof LayerWhere>).every((k) => l[k] === w[k]);

  const qtyOf = (id: string): string => layers.find((l) => l.id === id)!.quantity.toFixed(4);

  beforeEach(async () => {
    prisma = createMockPrisma();
    layers = [];

    // In-memory table: filters like Postgres would, so a missing organizationId is observable.
    prisma.inventoryCostLayer.findMany.mockImplementation(((args: {
      where: LayerWhere & { quantity?: { gt: Decimal } };
    }) => {
      const { quantity, ...where } = args.where;
      const rows = layers
        .filter((l) => matches(l, where) && (!quantity || l.quantity.gt(quantity.gt)))
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
        .map((l) => ({
          ...l,
          item: { id: l.itemId, name: `Item ${l.itemId}`, sku: `SKU-${l.itemId}` },
        }));
      return Promise.resolve(rows);
    }) as never);
    prisma.inventoryCostLayer.findFirst.mockImplementation(((args: { where: LayerWhere }) =>
      Promise.resolve(layers.find((l) => matches(l, args.where)) ?? null)) as never);
    prisma.inventoryCostLayer.update.mockImplementation(((args: {
      where: LayerWhere;
      data: { quantity: Decimal };
    }) => {
      const row = layers.find((l) => matches(l, args.where));
      if (!row) return Promise.reject(new Error('Record to update not found'));
      row.quantity = args.data.quantity;
      return Promise.resolve(row);
    }) as never);
    prisma.inventoryCostLayer.create.mockImplementation(((args: {
      data: Prisma.InventoryCostLayerUncheckedCreateInput;
    }) => {
      // Mirrors the inventory_cost_layers_source_event_key unique index (NULL references never collide).
      const { organizationId, itemId, warehouseId, referenceType, referenceId } = args.data;
      if (
        referenceType &&
        referenceId &&
        layers.some((l) =>
          matches(l, { organizationId, itemId, warehouseId, referenceType, referenceId }),
        )
      ) {
        return Promise.reject(
          new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
            code: 'P2002',
            clientVersion: 'test',
          }),
        );
      }
      const row = layer(`new-${layers.length + 1}`, '0', '0', layers.length, {
        ...(args.data as Partial<InventoryCostLayer>),
      });
      layers.push(row);
      return Promise.resolve(row);
    }) as never);

    const module: TestingModule = await Test.createTestingModule({
      providers: [CostingService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(CostingService);
  });

  function expectEveryQueryScopedTo(org: string): void {
    const calls = [
      ...prisma.inventoryCostLayer.findMany.mock.calls,
      ...prisma.inventoryCostLayer.findFirst.mock.calls,
      ...prisma.inventoryCostLayer.update.mock.calls,
    ];
    for (const [args] of calls) {
      expect((args as { where: LayerWhere }).where.organizationId).toBe(org);
    }
    for (const [args] of prisma.inventoryCostLayer.create.mock.calls) {
      expect(args.data.organizationId).toBe(org);
    }
  }

  describe('consumeFIFO (COGS)', () => {
    beforeEach(() => {
      layers.push(
        layer('L2', '5', '12.5000', 2),
        layer('L1', '10', '10.0000', 1), // older, inserted second: order must come from createdAt
        layer('X1', '100', '1.0000', 0, { organizationId: OTHER_ORG }),
      );
    });

    it('consumes the oldest layer first and costs exactly qty × unit cost', async () => {
      const result = await service.consumeFIFO(ORG, ITEM, WH, 4);

      expect(result.totalCost.toFixed(4)).toBe('40.0000');
      expect(result.layersConsumed).toBe(1);
      expect(qtyOf('L1')).toBe('6.0000');
      expect(qtyOf('L2')).toBe('5.0000');
    });

    it('spans layers: full oldest layer plus a partial next layer', async () => {
      const result = await service.consumeFIFO(ORG, ITEM, WH, new Decimal('12.5'));

      // 10 × 10.00 + 2.5 × 12.50 = 131.25
      expect(result.totalCost).toBeInstanceOf(Decimal);
      expect(result.totalCost.toFixed(4)).toBe('131.2500');
      expect(result.layersConsumed).toBe(2);
      expect(qtyOf('L1')).toBe('0.0000');
      expect(qtyOf('L2')).toBe('2.5000');
    });

    it('keeps fractional cost exact in Decimal (no float drift)', async () => {
      layers.length = 0;
      layers.push(layer('F1', '3', '0.1000', 1), layer('F2', '3', '0.2000', 2));

      const result = await service.consumeFIFO(ORG, ITEM, WH, '0.3' as unknown as number);

      expect(result.totalCost.toString()).toBe('0.03');
    });

    it('insufficient stock: consumes every layer and costs only the stock that existed', async () => {
      const result = await service.consumeFIFO(ORG, ITEM, WH, 20);

      // 10 × 10.00 + 5 × 12.50; the 5 missing units carry no cost.
      expect(result.totalCost.toFixed(4)).toBe('162.5000');
      expect(result.layersConsumed).toBe(2);
      expect(qtyOf('L1')).toBe('0.0000');
      expect(qtyOf('L2')).toBe('0.0000');
    });

    it('zero stock: no layers, zero cost, no writes', async () => {
      layers.splice(0, 2);

      const result = await service.consumeFIFO(ORG, ITEM, WH, 3);

      expect(result.totalCost.toFixed(4)).toBe('0.0000');
      expect(result.layersConsumed).toBe(0);
      expect(prisma.inventoryCostLayer.update).not.toHaveBeenCalled();
    });

    it('zero quantity: costs nothing and writes nothing', async () => {
      const result = await service.consumeFIFO(ORG, ITEM, WH, 0);

      expect(result.totalCost.toFixed(4)).toBe('0.0000');
      expect(prisma.inventoryCostLayer.update).not.toHaveBeenCalled();
    });

    it('never reads or writes another organization layers; every query carries organizationId', async () => {
      await service.consumeFIFO(ORG, ITEM, WH, 15);

      expectEveryQueryScopedTo(ORG);
      expect(qtyOf('X1')).toBe('100.0000');
    });

    it('consumes the other organization only within its own layers', async () => {
      const result = await service.consumeFIFO(OTHER_ORG, ITEM, WH, 7);

      expect(result.totalCost.toFixed(4)).toBe('7.0000');
      expect(qtyOf('X1')).toBe('93.0000');
      expect(qtyOf('L1')).toBe('10.0000');
      expectEveryQueryScopedTo(OTHER_ORG);
    });
  });

  describe('addCostLayer', () => {
    it('creates a layer with exact Decimal quantity, original quantity and unit cost', async () => {
      await service.addCostLayer(ORG, ITEM, WH, 8, '2.3456' as unknown as number, 'bill', 'bill-1');

      const { data } = prisma.inventoryCostLayer.create.mock.calls[0][0];
      expect(data).toMatchObject({ itemId: ITEM, warehouseId: WH, organizationId: ORG });
      expect((data.quantity as Decimal).toFixed(4)).toBe('8.0000');
      expect((data.originalQty as Decimal).toFixed(4)).toBe('8.0000');
      expect((data.costPerUnit as Decimal).toFixed(4)).toBe('2.3456');
      expectEveryQueryScopedTo(ORG);
    });

    it.each([0, -1])('ignores a non-positive quantity (%p)', async (qty) => {
      await expect(service.addCostLayer(ORG, ITEM, WH, qty, 5)).resolves.toBeNull();
      expect(prisma.inventoryCostLayer.create).not.toHaveBeenCalled();
    });

    it('idempotent retry: the same source event twice creates one layer', async () => {
      const first = await service.addCostLayer(ORG, ITEM, WH, 4, 10, 'bill', 'bill-9');
      const retry = await service.addCostLayer(ORG, ITEM, WH, 4, 10, 'bill', 'bill-9');

      expect(prisma.inventoryCostLayer.create).toHaveBeenCalledTimes(1);
      expect(retry?.id).toBe(first?.id);
      expect(layers).toHaveLength(1);
      expectEveryQueryScopedTo(ORG);
    });

    it('concurrent retries of the same event: the unique index rejects the loser, which returns the winner layer', async () => {
      const [a, b] = await Promise.all([
        service.addCostLayer(ORG, ITEM, WH, 4, 10, 'bill', 'bill-9'),
        service.addCostLayer(ORG, ITEM, WH, 4, 10, 'bill', 'bill-9'),
      ]);

      // Both passed the existence check (nothing was stored yet), both tried to create.
      expect(prisma.inventoryCostLayer.create).toHaveBeenCalledTimes(2);
      expect(layers).toHaveLength(1);
      expect(layers[0].quantity.toFixed(4)).toBe('4.0000');
      expect(a?.id).toBe(layers[0].id);
      expect(b?.id).toBe(layers[0].id);
      expectEveryQueryScopedTo(ORG);
    });

    it('rethrows a unique violation that is not a duplicate source event', async () => {
      prisma.inventoryCostLayer.create.mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      );

      await expect(
        service.addCostLayer(ORG, ITEM, WH, 4, 10, 'bill', 'bill-9'),
      ).rejects.toMatchObject({
        code: 'P2002',
      });
      expect(layers).toHaveLength(0);
    });

    it('rethrows other database errors', async () => {
      prisma.inventoryCostLayer.create.mockRejectedValueOnce(new Error('connection lost'));

      await expect(service.addCostLayer(ORG, ITEM, WH, 4, 10, 'bill', 'bill-9')).rejects.toThrow(
        'connection lost',
      );
    });

    it('the same reference in another organization is a different event', async () => {
      layers.push(layer('X1', '4', '10', 0, { organizationId: OTHER_ORG, referenceId: 'bill-9' }));

      await service.addCostLayer(ORG, ITEM, WH, 4, 10, 'bill', 'bill-9');

      expect(prisma.inventoryCostLayer.create).toHaveBeenCalledTimes(1);
      expect(layers.filter((l) => l.organizationId === ORG)).toHaveLength(1);
      expectEveryQueryScopedTo(ORG);
    });

    it('without a reference every call adds a layer', async () => {
      await service.addCostLayer(ORG, ITEM, WH, 1, 1);
      await service.addCostLayer(ORG, ITEM, WH, 1, 1);

      expect(prisma.inventoryCostLayer.create).toHaveBeenCalledTimes(2);
    });
  });

  describe('getInventoryValuation', () => {
    beforeEach(() => {
      layers.push(
        layer('A1', '10', '10.0000', 1),
        layer('A2', '5', '12.5000', 2),
        layer('B1', '2', '3.3333', 3, { itemId: 'item-2' }),
        layer('E1', '0', '99.0000', 4), // fully consumed: excluded
        layer('X1', '100', '1.0000', 0, { organizationId: OTHER_ORG }),
      );
    });

    it('sums remaining layers per item and in total, in Decimal', async () => {
      const result = await service.getInventoryValuation(ORG);

      // 10 × 10 + 5 × 12.5 + 2 × 3.3333 = 169.1666
      expect(result.totalValue.toFixed(4)).toBe('169.1666');
      expect(result.items).toEqual([
        expect.objectContaining({
          itemId: ITEM,
          sku: `SKU-${ITEM}`,
          totalQuantity: 15,
          totalValue: 162.5,
        }),
        expect.objectContaining({ itemId: 'item-2', totalQuantity: 2, totalValue: 6.6666 }),
      ]);
      expect(result.items[0].avgCostPerUnit).toBeCloseTo(10.8333, 4);
      expectEveryQueryScopedTo(ORG);
    });

    it('filters to one item and never includes another organization stock', async () => {
      const result = await service.getInventoryValuation(ORG, 'item-2');

      expect(result.totalValue.toFixed(4)).toBe('6.6666');
      expect(result.items.map((i) => i.itemId)).toEqual(['item-2']);
      expectEveryQueryScopedTo(ORG);
    });

    it('returns zero when the organization has no stock', async () => {
      const result = await service.getInventoryValuation('org-empty');

      expect(result.totalValue.toFixed(4)).toBe('0.0000');
      expect(result.items).toEqual([]);
    });
  });

  describe('getItemCost', () => {
    beforeEach(() => {
      layers.push(
        layer('A1', '10', '10.0000', 1),
        layer('A2', '5', '12.5000', 2, { warehouseId: 'wh-2' }),
        layer('X1', '100', '1.0000', 0, { organizationId: OTHER_ORG }),
      );
    });

    it('weighted average across warehouses', async () => {
      const result = await service.getItemCost(ORG, ITEM);

      expect(result.totalQuantity.toFixed(4)).toBe('15.0000');
      expect(result.totalValue.toFixed(4)).toBe('162.5000');
      expect(result.avgCostPerUnit.toFixed(4)).toBe('10.8333');
      expectEveryQueryScopedTo(ORG);
    });

    it('limited to one warehouse', async () => {
      const result = await service.getItemCost(ORG, ITEM, 'wh-2');

      expect(result.avgCostPerUnit.toFixed(4)).toBe('12.5000');
      expect(result.totalValue.toFixed(4)).toBe('62.5000');
    });

    it('zero stock gives a zero average instead of dividing by zero', async () => {
      const result = await service.getItemCost(ORG, 'item-none');

      expect(result.avgCostPerUnit.toFixed(4)).toBe('0.0000');
      expect(result.totalQuantity.toFixed(4)).toBe('0.0000');
    });
  });
});
