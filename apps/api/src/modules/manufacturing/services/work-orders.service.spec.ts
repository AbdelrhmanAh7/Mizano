import { Decimal } from '@prisma/client/runtime/library';
import { WorkOrdersService } from './work-orders.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { createMockPrisma } from '../../../test/mocks/prisma.mock';
import { JournalsService } from '../../accounting/services/journals.service';

describe('WorkOrdersService', () => {
  it('bulk-completes by calling the single work-order command and reports each outcome', async () => {
    const prisma = createMockPrisma();
    const service = new WorkOrdersService(
      prisma as unknown as PrismaService,
      { create: jest.fn() } as unknown as JournalsService,
    );
    jest.spyOn(service, 'completeWorkOrder').mockImplementation(async (_org, id) => {
      if (id === 'missing') throw new Error('Work order not found');
      return { id } as Awaited<ReturnType<WorkOrdersService['completeWorkOrder']>>;
    });

    const result = await service.bulkComplete('org', ['wo-1', 'missing', 'wo-1', 'wo-2']);

    expect(service.completeWorkOrder).toHaveBeenNthCalledWith(1, 'org', 'wo-1', {});
    expect(service.completeWorkOrder).toHaveBeenNthCalledWith(2, 'org', 'missing', {});
    expect(service.completeWorkOrder).toHaveBeenNthCalledWith(3, 'org', 'wo-2', {});
    expect(result).toEqual({
      processed: 2,
      total: 3,
      failures: [{ id: 'missing', reason: 'Work order not found' }],
    });
  });

  it('uses the planned quantity and posts the COGM journal through JournalsService', async () => {
    const prisma = createMockPrisma();
    const tx = prisma;
    const workOrder = {
      id: 'wo-1',
      workOrderNumber: 'WO-001',
      quantity: 4,
      notes: null,
      bom: {
        outputItemId: 'finished',
        outputQuantity: 1,
        operationsCost: new Decimal(0),
        items: [
          { itemId: 'raw', quantity: new Decimal(1), item: { costPrice: new Decimal('0.3') } },
        ],
      },
    };
    prisma.workOrder.updateMany.mockResolvedValue({ count: 1 } as never);
    prisma.workOrder.findFirst.mockResolvedValue(workOrder as never);
    prisma.warehouse.findFirst.mockResolvedValue({ id: 'warehouse' } as never);
    prisma.item.findFirst.mockResolvedValue({ inventoryAccountId: 'finished-account' } as never);
    prisma.account.findFirst
      .mockResolvedValueOnce({ id: 'finished-account' } as never)
      .mockResolvedValueOnce({ id: 'raw-account' } as never);
    prisma.workOrder.update.mockResolvedValue({ id: 'wo-1', journalId: 'journal-1' } as never);
    const journalsService = {
      create: jest.fn().mockResolvedValue({ id: 'journal-1' }),
    } as unknown as JournalsService;
    const service = new WorkOrdersService(prisma as unknown as PrismaService, journalsService);

    await service.completeWorkOrder('org-1', 'wo-1', {});

    expect(prisma.inventoryMovement.create).toHaveBeenCalledTimes(2);
    expect(prisma.inventoryMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ itemId: 'raw', quantity: 4, movementType: 'OUT' }),
      }),
    );
    expect(prisma.inventoryMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ itemId: 'finished', quantity: 4, movementType: 'IN' }),
      }),
    );
    expect(journalsService.create).toHaveBeenCalledWith(
      'org-1',
      expect.objectContaining({
        lines: expect.arrayContaining([
          expect.objectContaining({ accountId: 'finished-account', debit: '1.2000' }),
          expect.objectContaining({ accountId: 'raw-account', credit: '1.2000' }),
        ]),
      }),
      expect.objectContaining({
        tx,
        source: { type: 'WORK_ORDER_COMPLETION', id: 'wo-1' },
      }),
    );
  });

  it('always scopes work-order lookup and stock availability to the organization', async () => {
    const prisma = createMockPrisma();
    const service = new WorkOrdersService(
      prisma as unknown as PrismaService,
      { create: jest.fn() } as unknown as JournalsService,
    );
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
      { quantity: new Decimal(5), movementType: 'IN' },
      { quantity: new Decimal(3), movementType: 'OUT' },
    ] as never);

    const result = await service.checkMaterialAvailability('org', 'wo');

    expect(result.materials[0].available).toBe(2);
    expect(prisma.inventoryMovement.findMany).toHaveBeenCalledWith({
      where: { itemId: 'item', organizationId: 'org' },
      select: { quantity: true, movementType: true },
    });
  });
});

describe('WorkOrdersService movement signs', () => {
  it.each(['legacy', 'new'])('%s rows give the same stock and shortfall', async (kind) => {
    const prisma = createMockPrisma();
    const service = new WorkOrdersService(
      prisma as unknown as PrismaService,
      { create: jest.fn() } as unknown as JournalsService,
    );
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
