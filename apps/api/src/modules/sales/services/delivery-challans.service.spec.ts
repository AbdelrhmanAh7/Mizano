import { BadRequestException, NotFoundException } from '@nestjs/common';
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
      expect(prisma.deliveryChallan.update).not.toHaveBeenCalled();
    });

    it('rejects a warehouse outside the org before writing', async () => {
      prisma.item.findFirst.mockResolvedValue({ id: 'item-b' } as never);
      const dto = { lines: [{ itemId: 'item-b', quantity: 1, warehouseId: 'wh-a' }] };
      await expect(service.update(ORG, 'dc-1', dto)).rejects.toThrow('Warehouse wh-a not found');
      expect(prisma.deliveryChallanLine.deleteMany).not.toHaveBeenCalled();
      expect(prisma.deliveryChallan.update).not.toHaveBeenCalled();
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

    it('rejects with 400 and writes no lines when the challan is no longer DRAFT', async () => {
      prisma.item.findFirst.mockResolvedValue({ id: 'item-b' } as never);
      prisma.deliveryChallan.updateMany.mockResolvedValue({ count: 0 } as never);
      await expect(
        service.update(ORG, 'dc-1', { lines: [{ itemId: 'item-b', quantity: 1 }] }),
      ).rejects.toThrow(BadRequestException);
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
    it('rejects a line item outside the org without moving inventory', async () => {
      prisma.deliveryChallan.findFirst.mockResolvedValue(
        challan(status, { itemId: 'item-a', warehouseId: null }) as never,
      );
      prisma.item.findFirst.mockResolvedValue(null);
      await expect(service[method](ORG, 'dc-1')).rejects.toThrow('Item item-a not found');
      expect(scopedTo(prisma.item.findFirst as jest.Mock)).toEqual([
        { id: 'item-a', organizationId: ORG },
      ]);
      expect(prisma.inventoryLevel.update).not.toHaveBeenCalled();
      expect(prisma.inventoryMovement.create).not.toHaveBeenCalled();
      expect(prisma.deliveryChallan.update).not.toHaveBeenCalled();
    });

    it('rejects a line warehouse outside the org without moving inventory', async () => {
      prisma.deliveryChallan.findFirst.mockResolvedValue(
        challan(status, { itemId: 'item-b', warehouseId: 'wh-a' }) as never,
      );
      prisma.item.findFirst.mockResolvedValue({ id: 'item-b', trackInventory: true } as never);
      prisma.warehouse.findFirst.mockResolvedValue(null);
      await expect(service[method](ORG, 'dc-1')).rejects.toThrow('Warehouse wh-a not found');
      expect(prisma.inventoryMovement.create).not.toHaveBeenCalled();
      expect(prisma.deliveryChallan.update).not.toHaveBeenCalled();
    });
  });

  it('reads stock for the issue check within the org only', async () => {
    prisma.deliveryChallan.findFirst.mockResolvedValue(
      challan(ChallanStatus.DRAFT, { itemId: 'item-b', warehouseId: null }) as never,
    );
    prisma.item.findFirst.mockResolvedValue({ id: 'item-b', trackInventory: true } as never);
    prisma.inventoryLevel.aggregate.mockResolvedValue({ _sum: { quantity: null } } as never);
    await expect(service.issue(ORG, 'dc-1')).rejects.toThrow('Insufficient stock');
    expect(prisma.inventoryLevel.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { itemId: 'item-b', organizationId: ORG } }),
    );
  });
});
