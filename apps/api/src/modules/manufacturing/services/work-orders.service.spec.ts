import { Decimal } from '@prisma/client/runtime/library';
import { WorkOrderStatus } from '@prisma/client';
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

describe('WorkOrdersService.bulkComplete', () => {
  const ORG = 'org';
  const workOrder = (id: string, status: WorkOrderStatus = WorkOrderStatus.IN_PROCESS) => ({
    id,
    workOrderNumber: `WO-${id}`,
    status,
    quantity: 3,
    notes: null,
    bom: {
      outputItemId: 'output',
      outputQuantity: 1,
      operationsCost: new Decimal(0),
      items: [
        { itemId: 'component', quantity: new Decimal(2), item: { costPrice: new Decimal(10) } },
      ],
    },
  });

  function setup(orders: Record<string, ReturnType<typeof workOrder>>) {
    const prisma = createMockPrisma();
    const service = new WorkOrdersService(prisma as unknown as PrismaService);
    prisma.workOrder.findFirst.mockImplementation(((args: { where: { id: string } }) =>
      Promise.resolve(orders[args.where.id] ?? null)) as never);
    prisma.warehouse.findFirst.mockResolvedValue({ id: 'wh' } as never);
    prisma.item.findFirst.mockResolvedValue({ inventoryAccountId: 'acc-fg' } as never);
    prisma.account.findFirst.mockImplementation(((args: { where: { id?: string } }) =>
      Promise.resolve({ id: args.where.id ?? 'acc-raw' })) as never);
    prisma.journal.findFirst.mockResolvedValue(null);
    prisma.journal.create.mockResolvedValue({ id: 'jrn' } as never);
    prisma.workOrder.update.mockResolvedValue({} as never);
    prisma.productionEntry.count.mockResolvedValue(0);
    return { prisma, service };
  }

  const journalLines = (prisma: ReturnType<typeof createMockPrisma>, call: number) =>
    (prisma.journal.create.mock.calls[call][0].data.lines as { create: unknown[] }).create;

  it('posts the same journal, movements and completion as completing one by one', async () => {
    const { prisma, service } = setup({ single: workOrder('single'), bulk: workOrder('bulk') });

    await service.completeWorkOrder(ORG, 'single', { quantityProduced: 3 });
    const result = await service.bulkComplete(ORG, ['bulk']);

    expect(result).toEqual({ processed: 1, total: 1, failures: [] });
    expect(prisma.journal.create).toHaveBeenCalledTimes(2);
    const [single, bulk] = [journalLines(prisma, 0), journalLines(prisma, 1)];
    const amounts = (lines: unknown[]) =>
      (lines as Array<{ accountId: string; debit: Decimal; credit: Decimal }>).map((l) => [
        l.accountId,
        l.debit.toString(),
        l.credit.toString(),
      ]);
    expect(amounts(bulk)).toEqual(amounts(single));
    expect(amounts(single)).toEqual([
      ['acc-fg', '60', '0'],
      ['acc-raw', '0', '60'],
    ]);
    const movements = prisma.inventoryMovement.create.mock.calls.map(([arg]) => [
      arg.data.referenceId,
      arg.data.movementType,
      arg.data.quantity,
    ]);
    expect(movements).toEqual([
      ['single', 'OUT', 6],
      ['single', 'IN', 3],
      ['bulk', 'OUT', 6],
      ['bulk', 'IN', 3],
    ]);
    expect(prisma.workOrder.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { id: 'bulk' },
        data: expect.objectContaining({ status: WorkOrderStatus.COMPLETED, journalId: 'jrn' }),
      }),
    );
  });

  it('defaults quantityProduced to the planned quantity of each order', async () => {
    const { service } = setup({ a: workOrder('a'), b: { ...workOrder('b'), quantity: 7 } });
    const complete = jest.spyOn(service, 'completeWorkOrder');

    await service.bulkComplete(ORG, ['a', 'b']);

    expect(complete).toHaveBeenCalledWith(ORG, 'a', { quantityProduced: 3 });
    expect(complete).toHaveBeenCalledWith(ORG, 'b', { quantityProduced: 7 });
  });

  it('reports failures per order and processes the rest', async () => {
    const { prisma, service } = setup({
      ok: workOrder('ok'),
      draft: workOrder('draft', WorkOrderStatus.DRAFT),
    });

    const result = await service.bulkComplete(ORG, ['ok', 'draft', 'ghost', 'ok']);

    expect(result).toEqual({
      processed: 1,
      total: 3,
      failures: [
        { id: 'draft', reason: 'Work order is not in process' },
        { id: 'ghost', reason: 'Work order not found' },
      ],
    });
    expect(prisma.journal.create).toHaveBeenCalledTimes(1);
    expect(prisma.workOrder.updateMany).not.toHaveBeenCalled();
  });

  it('refuses orders with recorded production so their stock is not moved twice', async () => {
    const { prisma, service } = setup({ partial: workOrder('partial') });
    prisma.productionEntry.count.mockResolvedValue(1);

    const result = await service.bulkComplete(ORG, ['partial']);

    expect(result.processed).toBe(0);
    expect(result.failures).toEqual([
      { id: 'partial', reason: expect.stringContaining('recorded production') },
    ]);
    expect(prisma.productionEntry.count).toHaveBeenCalledWith({
      where: { workOrderId: 'partial', organizationId: ORG },
    });
    expect(prisma.inventoryMovement.create).not.toHaveBeenCalled();
    expect(prisma.journal.create).not.toHaveBeenCalled();
  });

  it('only looks up orders of the caller organization', async () => {
    const { prisma, service } = setup({ a: workOrder('a') });

    await service.bulkComplete(ORG, ['a']);

    expect(prisma.workOrder.findFirst).toHaveBeenCalled();
    for (const [args] of prisma.workOrder.findFirst.mock.calls) {
      expect(args?.where).toMatchObject({ id: 'a', organizationId: ORG, deletedAt: null });
    }
  });
});
