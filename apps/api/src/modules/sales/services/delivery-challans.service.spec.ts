import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { ChallanStatus, ChallanType } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { DeliveryChallansService } from './delivery-challans.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { createMockPrisma, MockPrismaClient } from '../../../test/mocks/prisma.mock';

const ORG = 'org-b';

function challan(status: ChallanStatus, line: { itemId: string; warehouseId: string | null }) {
  return {
    id: 'dc-1',
    challanNumber: 'DC-001',
    status,
    organizationId: ORG,
    lines: [{ id: 'line-1', quantity: new Decimal(2), item: null, ...line }],
  };
}

/** Validation failures must stop before the transaction opens: no write mock may have run. */
function expectNoWrites(prisma: MockPrismaClient): void {
  expect(prisma.$transaction).not.toHaveBeenCalled();
  expect(prisma.deliveryChallan.updateMany).not.toHaveBeenCalled();
  for (const model of [prisma.deliveryChallan, prisma.deliveryChallanLine] as const) {
    for (const op of [
      'update',
      'updateMany',
      'create',
      'createMany',
      'delete',
      'deleteMany',
      'upsert',
    ] as const) {
      expect((model as unknown as Record<string, jest.Mock>)[op]).not.toHaveBeenCalled();
    }
  }
}

describe('DeliveryChallansService tenant scoping (#131)', () => {
  let prisma: MockPrismaClient;
  let service: DeliveryChallansService;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new DeliveryChallansService(prisma as unknown as PrismaService);
  });

  const scopedTo = (mock: jest.Mock): unknown[] =>
    mock.mock.calls.map(([args]) => (args as { where: { organizationId?: string } }).where);

  describe('update', () => {
    beforeEach(() => {
      prisma.deliveryChallan.findFirst.mockResolvedValue(
        challan(ChallanStatus.DRAFT, { itemId: 'item-b', warehouseId: null }) as never,
      );
    });

    it.each([
      ['customer', { customerId: 'cust-a' }, 'Customer not found'],
      ['invoice', { invoiceId: 'inv-a' }, 'Invoice not found'],
      ['item', { lines: [{ itemId: 'item-a', quantity: 1 }] }, 'Item item-a not found'],
    ])('rejects a %s outside the org before writing', async (_label, dto, message) => {
      await expect(service.update(ORG, 'dc-1', dto)).rejects.toThrow(
        new NotFoundException(message),
      );
      expect(prisma.deliveryChallanLine.deleteMany).not.toHaveBeenCalled();
      expectNoWrites(prisma);
    });

    it('rejects a warehouse outside the org before writing', async () => {
      prisma.item.findFirst.mockResolvedValue({ id: 'item-b' } as never);
      const dto = { lines: [{ itemId: 'item-b', quantity: 1, warehouseId: 'wh-a' }] };
      await expect(service.update(ORG, 'dc-1', dto)).rejects.toThrow('Warehouse wh-a not found');
      expect(prisma.deliveryChallanLine.deleteMany).not.toHaveBeenCalled();
      expectNoWrites(prisma);
    });

    it('looks every reference up within the org', async () => {
      prisma.customer.findFirst.mockResolvedValue({ id: 'cust-b' } as never);
      prisma.invoice.findFirst.mockResolvedValue({ id: 'inv-b' } as never);
      prisma.item.findFirst.mockResolvedValue({ id: 'item-b' } as never);
      prisma.warehouse.findFirst.mockResolvedValue({ id: 'wh-b' } as never);
      prisma.deliveryChallan.updateMany.mockResolvedValue({ count: 1 } as never);
      await service.update(ORG, 'dc-1', {
        customerId: 'cust-b',
        invoiceId: 'inv-b',
        challanType: ChallanType.SUPPLY,
        lines: [{ itemId: 'item-b', quantity: 1, warehouseId: 'wh-b' }],
      });
      for (const mock of [
        prisma.customer.findFirst,
        prisma.invoice.findFirst,
        prisma.item.findFirst,
        prisma.warehouse.findFirst,
      ]) {
        expect(scopedTo(mock as jest.Mock)).toEqual([
          expect.objectContaining({ organizationId: ORG, deletedAt: null }),
        ]);
      }
      expect(prisma.deliveryChallan.updateMany).toHaveBeenCalled();
    });

    it('rejects with 409 and writes no lines when the challan is no longer DRAFT', async () => {
      prisma.item.findFirst.mockResolvedValue({ id: 'item-b' } as never);
      prisma.deliveryChallan.updateMany.mockResolvedValue({ count: 0 } as never);
      await expect(
        service.update(ORG, 'dc-1', { lines: [{ itemId: 'item-b', quantity: 1 }] }),
      ).rejects.toThrow(ConflictException);
      expect(prisma.deliveryChallanLine.deleteMany).not.toHaveBeenCalled();
      expect(prisma.deliveryChallanLine.createMany).not.toHaveBeenCalled();
    });

    it('answers 404 and writes no lines when the guarded update finds no row in the org', async () => {
      prisma.item.findFirst.mockResolvedValue({ id: 'item-b' } as never);
      prisma.deliveryChallan.updateMany.mockResolvedValue({ count: 0 } as never);
      prisma.deliveryChallan.findFirst
        .mockResolvedValueOnce(
          challan(ChallanStatus.DRAFT, { itemId: 'item-b', warehouseId: null }) as never,
        )
        .mockResolvedValueOnce(null as never);
      await expect(
        service.update(ORG, 'dc-1', { lines: [{ itemId: 'item-b', quantity: 1 }] }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.deliveryChallanLine.deleteMany).not.toHaveBeenCalled();
      expect(prisma.deliveryChallanLine.createMany).not.toHaveBeenCalled();
    });

    it('answers 400 when the guarded update finds the challan already ISSUED', async () => {
      prisma.deliveryChallan.updateMany.mockResolvedValue({ count: 0 } as never);
      prisma.deliveryChallan.findFirst
        .mockResolvedValueOnce(
          challan(ChallanStatus.DRAFT, { itemId: 'item-b', warehouseId: null }) as never,
        )
        .mockResolvedValueOnce({ status: ChallanStatus.ISSUED } as never);
      await expect(service.update(ORG, 'dc-1', { notes: 'x' })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects and writes no lines when the guarded update matches more than one row', async () => {
      prisma.item.findFirst.mockResolvedValue({ id: 'item-b' } as never);
      prisma.deliveryChallan.updateMany.mockResolvedValue({ count: 2 } as never);
      await expect(
        service.update(ORG, 'dc-1', { lines: [{ itemId: 'item-b', quantity: 1 }] }),
      ).rejects.toThrow(ConflictException);
      expect(prisma.deliveryChallanLine.deleteMany).not.toHaveBeenCalled();
      expect(prisma.deliveryChallanLine.createMany).not.toHaveBeenCalled();
    });

    it('propagates a mid-update failure out of the transaction', async () => {
      prisma.item.findFirst.mockResolvedValue({ id: 'item-b' } as never);
      prisma.deliveryChallan.updateMany.mockResolvedValue({ count: 1 } as never);
      prisma.deliveryChallanLine.createMany.mockRejectedValue(new Error('boom') as never);
      await expect(
        service.update(ORG, 'dc-1', { lines: [{ itemId: 'item-b', quantity: 1 }] }),
      ).rejects.toThrow('boom');
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });
  });

  describe.each([
    ['issue', ChallanStatus.DRAFT],
    ['markReturned', ChallanStatus.ISSUED],
  ] as const)('%s', (method, status) => {
    beforeEach(() => {
      // Mock the initial findOne call (from the service's findOne method)
      prisma.deliveryChallan.findFirst.mockResolvedValue(
        challan(status, { itemId: 'item-b', warehouseId: null }) as never,
      );
      // Mock the updateMany guard to succeed by default
      prisma.deliveryChallan.updateMany.mockResolvedValue({ count: 1 } as never);
      // Mock the reload findFirst after updateMany
      prisma.deliveryChallan.findFirst.mockResolvedValue(
        challan(status, { itemId: 'item-b', warehouseId: null }) as never,
      );
    });

    it('rejects a line item outside the org without moving inventory', async () => {
      // Override the reload findFirst to return a challan with the foreign item
      prisma.deliveryChallan.findFirst
        .mockResolvedValueOnce(challan(status, { itemId: 'item-a', warehouseId: null }) as never) // initial findOne
        .mockResolvedValueOnce({ count: 1 } as never) // updateMany
        .mockResolvedValueOnce(challan(status, { itemId: 'item-a', warehouseId: null }) as never); // reload
      prisma.item.findFirst.mockResolvedValue(null);
      await expect(service[method](ORG, 'dc-1')).rejects.toThrow('Item item-a not found');
      expect(scopedTo(prisma.item.findFirst as jest.Mock)).toEqual([
        { id: 'item-a', organizationId: ORG },
      ]);
      expect(prisma.inventoryLevel.update).not.toHaveBeenCalled();
      expect(prisma.inventoryMovement.create).not.toHaveBeenCalled();
    });

    it('rejects a line warehouse outside the org without moving inventory', async () => {
      prisma.deliveryChallan.findFirst
        .mockResolvedValueOnce(challan(status, { itemId: 'item-b', warehouseId: 'wh-a' }) as never)
        .mockResolvedValueOnce({ count: 1 } as never)
        .mockResolvedValueOnce(challan(status, { itemId: 'item-b', warehouseId: 'wh-a' }) as never);
      prisma.item.findFirst.mockResolvedValue({ id: 'item-b', trackInventory: true } as never);
      prisma.warehouse.findFirst.mockResolvedValue(null);
      await expect(service[method](ORG, 'dc-1')).rejects.toThrow('Warehouse wh-a not found');
      expect(prisma.inventoryMovement.create).not.toHaveBeenCalled();
    });

    it('rejects with 409 when challan is not in expected status', async () => {
      prisma.deliveryChallan.updateMany.mockResolvedValue({ count: 0 } as never);
      await expect(service[method](ORG, 'dc-1')).rejects.toThrow(ConflictException);
      expect(prisma.inventoryMovement.create).not.toHaveBeenCalled();
    });

    it('answers 404 for a challan of another organization (or none)', async () => {
      prisma.deliveryChallan.updateMany.mockResolvedValue({ count: 0 } as never);
      prisma.deliveryChallan.findFirst.mockResolvedValue(null);
      await expect(service[method](ORG, 'dc-1')).rejects.toThrow(NotFoundException);
      expect(prisma.inventoryMovement.create).not.toHaveBeenCalled();
    });

    it('answers 400 when the challan is in another status', async () => {
      const other = status === ChallanStatus.DRAFT ? ChallanStatus.ISSUED : ChallanStatus.RETURNED;
      prisma.deliveryChallan.updateMany.mockResolvedValue({ count: 0 } as never);
      prisma.deliveryChallan.findFirst.mockResolvedValue(
        challan(other, { itemId: 'item-b', warehouseId: null }) as never,
      );
      await expect(service[method](ORG, 'dc-1')).rejects.toThrow(BadRequestException);
      expect(prisma.inventoryMovement.create).not.toHaveBeenCalled();
    });

    it('executes all queries and mutations through the transaction client tx, not prisma', async () => {
      const tx = createMockPrisma();
      (prisma.$transaction as jest.Mock).mockImplementation(async (fn) => fn(tx));
      const c = challan(status, { itemId: 'item-b', warehouseId: 'wh-b' });
      tx.deliveryChallan.updateMany.mockResolvedValue({ count: 1 } as never);
      tx.deliveryChallan.findFirst.mockResolvedValue(c as never);
      tx.item.findFirst.mockResolvedValue({ id: 'item-b', trackInventory: true } as never);
      tx.warehouse.findFirst.mockResolvedValue({ id: 'wh-b' } as never);
      tx.inventoryLevel.aggregate.mockResolvedValue({
        _sum: { quantity: new Decimal(10) },
      } as never);
      tx.inventoryLevel.findFirst.mockResolvedValue({
        id: 'lvl-1',
        warehouseId: 'wh-b',
      } as never);
      tx.inventoryLevel.update.mockResolvedValue({ id: 'lvl-1' } as never);
      tx.item.updateMany.mockResolvedValue({ count: 1 } as never);

      await service[method](ORG, 'dc-1');

      // Assert tx was used for all reads and writes
      expect(tx.deliveryChallan.updateMany).toHaveBeenCalled();
      expect(tx.deliveryChallan.findFirst).toHaveBeenCalled();
      expect(tx.item.findFirst).toHaveBeenCalledWith({
        where: { id: 'item-b', organizationId: ORG },
      });
      expect(tx.warehouse.findFirst).toHaveBeenCalledWith({
        where: { id: 'wh-b', organizationId: ORG },
      });
      if (method === 'issue') {
        expect(tx.inventoryLevel.aggregate).toHaveBeenCalledWith({
          where: { itemId: 'item-b', organizationId: ORG, warehouseId: 'wh-b' },
          _sum: { quantity: true },
        });
      }
      expect(tx.inventoryLevel.findFirst).toHaveBeenCalledWith({
        where: { itemId: 'item-b', organizationId: ORG, warehouseId: 'wh-b' },
      });
      expect(tx.inventoryLevel.update).toHaveBeenCalled();
      expect(tx.inventoryMovement.create).toHaveBeenCalled();
      expect(tx.item.updateMany).toHaveBeenCalled();

      // Assert prisma was NOT called directly (except $transaction)
      expect(prisma.deliveryChallan.updateMany).not.toHaveBeenCalled();
      expect(prisma.deliveryChallan.findFirst).not.toHaveBeenCalled();
      expect(prisma.item.findFirst).not.toHaveBeenCalled();
      expect(prisma.warehouse.findFirst).not.toHaveBeenCalled();
      expect(prisma.inventoryLevel.aggregate).not.toHaveBeenCalled();
      expect(prisma.inventoryLevel.findFirst).not.toHaveBeenCalled();
      expect(prisma.inventoryLevel.update).not.toHaveBeenCalled();
      expect(prisma.inventoryMovement.create).not.toHaveBeenCalled();
      expect(prisma.item.updateMany).not.toHaveBeenCalled();
    });

    it('throws if root prisma client is accessed during transaction (strict proxy guard)', async () => {
      const tx = createMockPrisma();
      const c = challan(status, { itemId: 'item-b', warehouseId: 'wh-b' });
      tx.deliveryChallan.updateMany.mockResolvedValue({ count: 1 } as never);
      tx.deliveryChallan.findFirst.mockResolvedValue(c as never);
      tx.item.findFirst.mockResolvedValue({ id: 'item-b', trackInventory: true } as never);
      tx.warehouse.findFirst.mockResolvedValue({ id: 'wh-b' } as never);
      tx.inventoryLevel.aggregate.mockResolvedValue({
        _sum: { quantity: new Decimal(10) },
      } as never);
      tx.inventoryLevel.findFirst.mockResolvedValue({
        id: 'lvl-1',
        warehouseId: 'wh-b',
      } as never);
      tx.inventoryLevel.update.mockResolvedValue({ id: 'lvl-1' } as never);
      tx.item.updateMany.mockResolvedValue({ count: 1 } as never);

      const rootPrismaProxy = new Proxy(prisma, {
        get(_target, prop) {
          if (prop === '$transaction') {
            return async (fn: (txClient: unknown) => Promise<unknown>) => fn(tx);
          }
          throw new Error(`Leak detected: root prisma.${String(prop)} accessed inside transaction`);
        },
      });

      const proxyService = new DeliveryChallansService(rootPrismaProxy as unknown as PrismaService);

      await expect(proxyService[method](ORG, 'dc-1')).resolves.toBeDefined();
    });

    it('propagates stock move failure out of the transaction so status change rolls back', async () => {
      const tx = createMockPrisma();
      (prisma.$transaction as jest.Mock).mockImplementation(async (fn) => fn(tx));
      const c = challan(status, { itemId: 'item-b', warehouseId: 'wh-b' });
      tx.deliveryChallan.updateMany.mockResolvedValue({ count: 1 } as never);
      tx.deliveryChallan.findFirst.mockResolvedValue(c as never);
      tx.item.findFirst.mockResolvedValue({ id: 'item-b', trackInventory: true } as never);
      tx.warehouse.findFirst.mockResolvedValue({ id: 'wh-b' } as never);
      tx.inventoryLevel.aggregate.mockResolvedValue({
        _sum: { quantity: new Decimal(10) },
      } as never);
      tx.inventoryLevel.findFirst.mockResolvedValue({
        id: 'lvl-1',
        warehouseId: 'wh-b',
      } as never);
      tx.inventoryMovement.create.mockRejectedValue(
        new Error('stock movement write failed') as never,
      );

      await expect(service[method](ORG, 'dc-1')).rejects.toThrow('stock movement write failed');
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });
  });

  describe.each([
    ['bulkDelete', 'remove'],
    ['bulkIssue', 'issue'],
  ] as const)('%s', (bulk, single) => {
    it(`runs ${single} per record and reports per-record failures`, async () => {
      const spy = jest
        .spyOn(service, single)
        .mockResolvedValueOnce({} as never)
        .mockRejectedValueOnce(new NotFoundException('Delivery challan not found'));
      await expect(service[bulk](ORG, ['dc-1', 'dc-2', 'dc-1'])).resolves.toEqual({
        processed: 1,
        total: 2,
        failures: [{ id: 'dc-2', reason: 'Delivery challan not found' }],
      });
      expect(spy.mock.calls).toEqual([
        [ORG, 'dc-1'],
        [ORG, 'dc-2'],
      ]);
      expect(prisma.deliveryChallan.updateMany).not.toHaveBeenCalled();
    });
  });

  it('reads stock for the issue check within the org only', async () => {
    prisma.deliveryChallan.findFirst
      .mockResolvedValueOnce(
        challan(ChallanStatus.DRAFT, { itemId: 'item-b', warehouseId: null }) as never,
      )
      .mockResolvedValueOnce(
        challan(ChallanStatus.DRAFT, { itemId: 'item-b', warehouseId: null }) as never,
      );
    prisma.deliveryChallan.updateMany.mockResolvedValue({ count: 1 } as never);
    prisma.item.findFirst.mockResolvedValue({ id: 'item-b', trackInventory: true } as never);
    prisma.inventoryLevel.aggregate.mockResolvedValue({ _sum: { quantity: null } } as never);
    await expect(service.issue(ORG, 'dc-1')).rejects.toThrow('Insufficient stock');
    expect(prisma.inventoryLevel.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { itemId: 'item-b', organizationId: ORG } }),
    );
  });

  describe('item stock total', () => {
    const tracked = (status: ChallanStatus, quantity: number) => {
      const c = challan(status, { itemId: 'item-b', warehouseId: 'wh-b' });
      c.lines[0].quantity = new Decimal(quantity);
      prisma.deliveryChallan.findFirst.mockResolvedValue(c as never);
      prisma.deliveryChallan.updateMany.mockResolvedValue({ count: 1 } as never);
      prisma.item.findFirst.mockResolvedValue({ id: 'item-b', trackInventory: true } as never);
      prisma.warehouse.findFirst.mockResolvedValue({ id: 'wh-b' } as never);
      prisma.inventoryLevel.aggregate.mockResolvedValue({
        _sum: { quantity: new Decimal(10) },
      } as never);
      prisma.inventoryLevel.findFirst.mockResolvedValue({
        id: 'lvl-1',
        warehouseId: 'wh-b',
      } as never);
      prisma.item.updateMany.mockResolvedValue({ count: 1 } as never);
    };

    it('issue takes the quantity off the item total as well as the warehouse level', async () => {
      tracked(ChallanStatus.DRAFT, 2);
      await service.issue(ORG, 'dc-1');
      expect(prisma.item.updateMany).toHaveBeenCalledWith({
        where: { id: 'item-b', organizationId: ORG },
        data: { currentStock: { decrement: 2 } },
      });
    });

    it('mark-returned puts the quantity back on the item total', async () => {
      tracked(ChallanStatus.ISSUED, 2);
      await service.markReturned(ORG, 'dc-1');
      expect(prisma.item.updateMany).toHaveBeenCalledWith({
        where: { id: 'item-b', organizationId: ORG },
        data: { currentStock: { increment: 2 } },
      });
    });

    it('refuses a fractional quantity of a stock-tracked item (stock is kept in whole units)', async () => {
      tracked(ChallanStatus.DRAFT, 1.5);
      await expect(service.issue(ORG, 'dc-1')).rejects.toThrow(BadRequestException);
      expect(prisma.inventoryMovement.create).not.toHaveBeenCalled();
      expect(prisma.item.updateMany).not.toHaveBeenCalled();
    });
  });
});
