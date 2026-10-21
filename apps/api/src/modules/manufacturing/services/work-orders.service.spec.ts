import { Decimal } from '@prisma/client/runtime/library';
import { WorkOrdersService } from './work-orders.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { createMockPrisma } from '../../../test/mocks/prisma.mock';

describe('WorkOrdersService movement signs', () => {
  it.each(['legacy', 'new'])('%s rows give the same stock and shortfall', async (kind) => {
    const prisma = createMockPrisma();
    const service = new WorkOrdersService(prisma as unknown as PrismaService);
    jest.spyOn(service, 'findOne').mockResolvedValue({
      quantity: 1,
      bom: {
        id: 'bom',
        name: 'BOM',
        outputQuantity: 1,
        items: [{ itemId: 'item', quantity: new Decimal(4), item: { id: 'item' } }],
      },
    } as never);
    prisma.inventoryMovement.findMany.mockResolvedValue([
      { quantity: new Decimal(5), movementType: kind === 'legacy' ? null : 'IN' },
      { quantity: new Decimal(kind === 'legacy' ? -3 : 3), movementType: 'OUT' },
      {
        quantity: new Decimal(kind === 'legacy' ? -1 : 1),
        movementType: kind === 'legacy' ? null : 'OUT',
      },
    ] as never);
    const result = await service.checkMaterialAvailability('org', 'wo');
    expect(result.materials[0].available).toBe(1);
    expect(result.materials[0].shortfall).toBe(3);
    expect(prisma.inventoryMovement.findMany).toHaveBeenCalledWith({
      where: { itemId: 'item', organizationId: 'org' },
      select: { quantity: true, movementType: true },
    });
  });
});

describe('WorkOrdersService.completeWorkOrder stock levels', () => {
  const workOrder = {
    id: 'wo-1',
    workOrderNumber: 'WO-001',
    quantity: 3,
    status: 'IN_PROCESS',
    notes: null,
    bom: {
      outputItemId: 'item-out',
      outputQuantity: 1,
      operationsCost: new Decimal(0),
      items: [
        { itemId: 'item-comp', quantity: new Decimal(2), item: { costPrice: new Decimal(10) } },
      ],
    },
  };

  const setup = () => {
    const prisma = createMockPrisma();
    prisma.warehouse.findFirst.mockResolvedValue({ id: 'wh-default' } as never);
    prisma.inventoryLevel.updateMany.mockResolvedValue({ count: 1 } as never);
    prisma.workOrder.update.mockResolvedValue({ id: 'wo-1', status: 'COMPLETED' } as never);
    const service = new WorkOrdersService(prisma as unknown as PrismaService);
    jest.spyOn(service, 'findOne').mockResolvedValue(workOrder as never);
    // The COGM journal is out of scope here: no accounts configured, so it is skipped
    prisma.item.findFirst.mockResolvedValue(null);
    prisma.account.findFirst.mockResolvedValue(null);
    return { prisma, service };
  };

  it('moves the warehouse levels and item totals together with the movements', async () => {
    const { prisma, service } = setup();

    await service.completeWorkOrder('org-a', 'wo-1', { quantityProduced: 3 });

    // components: 2 x 3 = 6 leave the default warehouse (guarded update) and the item total
    expect(prisma.inventoryLevel.updateMany).toHaveBeenCalledWith({
      where: {
        itemId: 'item-comp',
        warehouseId: 'wh-default',
        organizationId: 'org-a',
        quantity: { gte: new Decimal(6) },
      },
      data: { quantity: { decrement: 6 } },
    });
    expect(prisma.item.updateMany).toHaveBeenCalledWith({
      where: { id: 'item-comp', organizationId: 'org-a', currentStock: { gte: 6 } },
      data: { currentStock: { decrement: 6 } },
    });
    expect(prisma.inventoryMovement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        itemId: 'item-comp',
        quantity: 6,
        movementType: 'OUT',
        warehouseId: 'wh-default',
      }),
    });
    // finished goods: 3 enter the default warehouse level and the item total
    expect(prisma.inventoryMovement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ itemId: 'item-out', quantity: 3, movementType: 'IN' }),
    });
    expect(prisma.inventoryLevel.upsert).toHaveBeenCalledWith({
      where: { itemId_warehouseId: { itemId: 'item-out', warehouseId: 'wh-default' } },
      update: { quantity: { increment: 3 } },
      create: {
        itemId: 'item-out',
        warehouseId: 'wh-default',
        quantity: new Decimal(3),
        organizationId: 'org-a',
      },
    });
    expect(prisma.item.updateMany).toHaveBeenCalledWith({
      where: { id: 'item-out', organizationId: 'org-a' },
      data: { currentStock: { increment: 3 } },
    });
    expect(prisma.workOrder.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'COMPLETED' }) }),
    );
  });

  it('refuses to complete when the default warehouse lacks a component and writes no movement', async () => {
    const { prisma, service } = setup();
    prisma.inventoryLevel.updateMany.mockResolvedValue({ count: 0 } as never);

    await expect(
      service.completeWorkOrder('org-a', 'wo-1', { quantityProduced: 3 }),
    ).rejects.toThrow('Insufficient stock of component item-comp in the default warehouse');
    expect(prisma.inventoryMovement.create).not.toHaveBeenCalled();
    expect(prisma.workOrder.update).not.toHaveBeenCalled();
  });

  it.each([0, -1, Number.NaN, undefined])(
    'rejects quantityProduced %p before touching stock',
    async (quantityProduced) => {
      const { prisma, service } = setup();

      await expect(
        service.completeWorkOrder('org-a', 'wo-1', {
          quantityProduced: quantityProduced as unknown as number,
        }),
      ).rejects.toThrow('quantityProduced must be a positive number');
      expect(prisma.inventoryMovement.create).not.toHaveBeenCalled();
    },
  );

  it('requires a default warehouse', async () => {
    const { prisma, service } = setup();
    prisma.warehouse.findFirst.mockResolvedValue(null);

    await expect(
      service.completeWorkOrder('org-a', 'wo-1', { quantityProduced: 3 }),
    ).rejects.toThrow('No default warehouse found');
  });
});
