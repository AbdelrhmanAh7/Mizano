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

describe('WorkOrdersService.completeWorkOrder stock read models', () => {
  const setup = () => {
    const prisma = createMockPrisma();
    const service = new WorkOrdersService(prisma as unknown as PrismaService);
    jest.spyOn(service, 'findOne').mockResolvedValue({
      id: 'wo1',
      status: 'IN_PROCESS',
      notes: null,
      bom: {
        outputItemId: 'out',
        outputQuantity: 1,
        items: [{ itemId: 'comp', quantity: new Decimal(2), item: { id: 'comp' } }],
      },
    } as never);
    jest
      .spyOn(service as unknown as { createCOGMJournal: () => Promise<null> }, 'createCOGMJournal')
      .mockResolvedValue(null);
    prisma.warehouse.findFirst.mockResolvedValue({ id: 'wh' } as never);
    prisma.workOrder.update.mockResolvedValue({ id: 'wo1', status: 'COMPLETED' } as never);
    return { prisma, service };
  };

  it('decrements the component and increments the output in item stock and inventory levels', async () => {
    const { prisma, service } = setup();

    await service.completeWorkOrder('org', 'wo1', { quantityProduced: 3 });

    // 3 outputs x 2 components each = 6 consumed
    expect(prisma.item.update).toHaveBeenCalledWith({
      where: { id: 'comp' },
      data: { currentStock: { increment: -6 } },
    });
    expect(prisma.item.update).toHaveBeenCalledWith({
      where: { id: 'out' },
      data: { currentStock: { increment: 3 } },
    });
    expect(prisma.inventoryLevel.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { itemId_warehouseId: { itemId: 'comp', warehouseId: 'wh' } },
        update: { quantity: { increment: -6 } },
      }),
    );
    expect(prisma.inventoryLevel.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { itemId_warehouseId: { itemId: 'out', warehouseId: 'wh' } },
        update: { quantity: { increment: 3 } },
      }),
    );
    expect(prisma.inventoryMovement.create).toHaveBeenCalledTimes(2);
  });

  it('writes movements and levels inside one transaction', async () => {
    const { prisma, service } = setup();
    await service.completeWorkOrder('org', 'wo1', { quantityProduced: 1 });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('changes no stock when there is no default warehouse', async () => {
    const { prisma, service } = setup();
    prisma.warehouse.findFirst.mockResolvedValue(null);

    await expect(service.completeWorkOrder('org', 'wo1', { quantityProduced: 1 })).rejects.toThrow(
      'No default warehouse found',
    );
    expect(prisma.inventoryLevel.upsert).not.toHaveBeenCalled();
    expect(prisma.workOrder.update).not.toHaveBeenCalled();
  });
});
