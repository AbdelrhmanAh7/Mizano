import { ConflictException } from '@nestjs/common';
import { WorkOrderStatus } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { WorkOrdersService } from './work-orders.service';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  expectBalanced,
  realJournalsService,
  writtenJournals,
} from '../../../test/helpers/ledger.helpers';
import { createMockPrisma, MockPrismaClient } from '../../../test/mocks/prisma.mock';
import { JournalsService } from '../../accounting/services/journals.service';

describe('WorkOrdersService movement signs', () => {
  it.each(['legacy', 'new'])('%s rows give the same stock and shortfall', async (kind) => {
    const prisma = createMockPrisma();
    const service = new WorkOrdersService(
      prisma as unknown as PrismaService,
      {} as unknown as JournalsService,
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

describe('WorkOrdersService COGM posting (#130)', () => {
  const ORG = 'org-1';
  const workOrder = {
    id: 'wo-1',
    workOrderNumber: 'WO-001',
    status: WorkOrderStatus.IN_PROCESS,
    quantity: 1,
    notes: null,
    bom: {
      outputItemId: 'item-out',
      outputQuantity: 3,
      operationsCost: new Decimal('0.50'),
      items: [
        {
          itemId: 'item-raw',
          quantity: new Decimal('1'),
          item: { costPrice: new Decimal('3.3333') },
        },
      ],
    },
  };
  let prisma: MockPrismaClient;

  function serviceWithLock(lockDate: Date | null = null): WorkOrdersService {
    const service = new WorkOrdersService(
      prisma as unknown as PrismaService,
      realJournalsService(prisma, lockDate),
    );
    jest.spyOn(service, 'findOne').mockResolvedValue(workOrder as never);
    return service;
  }

  beforeEach(() => {
    prisma = createMockPrisma();
    prisma.workOrder.updateMany.mockResolvedValue({ count: 1 });
    prisma.workOrder.findFirst.mockResolvedValue(workOrder as never);
    prisma.warehouse.findFirst.mockResolvedValue({ id: 'wh-1' } as never);
    prisma.item.findFirst.mockResolvedValue({ inventoryAccountId: 'acc-inventory' } as never);
    prisma.account.findFirst.mockImplementation((({
      where,
    }: {
      where: { id?: string; type?: string };
    }) =>
      Promise.resolve(
        where.id ? { id: where.id } : { id: where.type === 'EXPENSE' ? 'acc-overhead' : 'acc-raw' },
      )) as never);
  });

  it('posts one balanced COGM journal with 4-dp quantities and per-line cost rounding', async () => {
    await serviceWithLock().completeWorkOrder(ORG, workOrder.id, { quantityProduced: 1 });

    const [journal, ...rest] = writtenJournals(prisma);
    expect(rest).toHaveLength(0);
    expectBalanced(journal.lines);
    expect(journal.sourceType).toBe('COGM');
    expect(journal.sourceId).toBe(workOrder.id);
    const finished = journal.lines.find((l) => l.accountId === 'acc-inventory');
    expect(finished?.debit.toFixed(2)).toBe('1.61');
    const consumed = prisma.inventoryMovement.create.mock.calls.find(
      ([args]) => args.data.movementType === 'OUT',
    );
    expect(String(consumed?.[0].data.quantity)).toBe('0.3333');
  });

  it('derives movements and journal from the work order reloaded inside the transaction', async () => {
    const edited = {
      ...workOrder,
      bom: {
        ...workOrder.bom,
        items: [{ ...workOrder.bom.items[0], item: { costPrice: new Decimal('6.0000') } }],
      },
    };
    prisma.workOrder.findFirst.mockResolvedValue(edited as never);

    await serviceWithLock().completeWorkOrder(ORG, workOrder.id, { quantityProduced: 3 });

    const [journal] = writtenJournals(prisma);
    expectBalanced(journal.lines);
    expect(journal.lines.find((l) => l.accountId === 'acc-inventory')?.debit.toFixed(2)).toBe(
      '6.50',
    );
  });

  it('takes the organization ledger lock before claiming the work order', async () => {
    await serviceWithLock().completeWorkOrder(ORG, workOrder.id, { quantityProduced: 1 });

    expect(prisma.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(
      prisma.workOrder.updateMany.mock.invocationCallOrder[0],
    );
  });

  it('rejects the completion when the lock date covers the completion date', async () => {
    const service = serviceWithLock(new Date('2099-01-01T00:00:00.000Z'));

    await expect(
      service.completeWorkOrder(ORG, workOrder.id, { quantityProduced: 1 }),
    ).rejects.toThrow(/locked/);
    expect(prisma.journal.create).not.toHaveBeenCalled();
  });

  it('does not post or move stock twice for a concurrent completion', async () => {
    prisma.workOrder.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      serviceWithLock().completeWorkOrder(ORG, workOrder.id, { quantityProduced: 1 }),
    ).rejects.toThrow(ConflictException);
    expect(prisma.inventoryMovement.create).not.toHaveBeenCalled();
    expect(prisma.journal.create).not.toHaveBeenCalled();
  });

  describe('bulk completion', () => {
    function bulkService(lockDate: Date | null = null): WorkOrdersService {
      const service = serviceWithLock(lockDate);
      const byId = async (_org: string, id: string): Promise<never> =>
        ({ ...workOrder, id }) as never;
      jest.spyOn(service, 'findOne').mockImplementation(byId);
      prisma.workOrder.findFirst.mockImplementation((({ where }: { where: { id: string } }) =>
        Promise.resolve({ ...workOrder, id: where.id })) as never);
      return service;
    }

    it('bulk completion posts one balanced COGM journal per work order through the single command', async () => {
      const service = bulkService();
      const complete = jest.spyOn(service, 'completeWorkOrder');

      const result = await service.bulkComplete(ORG, ['wo-1', 'wo-2']);

      expect(result).toEqual({ processed: 2, total: 2, failures: [] });
      const journals = writtenJournals(prisma);
      expect(journals).toHaveLength(2);
      journals.forEach((journal) => {
        expectBalanced(journal.lines);
        expect(journal.sourceType).toBe('COGM');
      });
      expect(journals.map((journal) => journal.sourceId)).toEqual(['wo-1', 'wo-2']);
      expect(complete).toHaveBeenCalledTimes(2);
      complete.mock.calls.forEach(([, , dto]) => {
        expect(dto.quantityProduced).toBe(workOrder.quantity);
      });
    });

    it('bulk completion reports an order completed meanwhile instead of posting it twice', async () => {
      prisma.workOrder.updateMany
        .mockResolvedValueOnce({ count: 1 })
        .mockResolvedValueOnce({ count: 0 });

      const result = await bulkService().bulkComplete(ORG, ['wo-1', 'wo-2']);

      expect(result.processed).toBe(1);
      expect(result.failures).toEqual([
        { id: 'wo-2', reason: 'Work order has already been completed' },
      ]);
      expect(writtenJournals(prisma)).toHaveLength(1);
    });

    it('bulk completion inside a locked period posts nothing and reports every order', async () => {
      const result = await bulkService(new Date('2099-01-01T00:00:00.000Z')).bulkComplete(ORG, [
        'wo-1',
        'wo-2',
      ]);

      expect(result.processed).toBe(0);
      expect(result.failures).toHaveLength(2);
      (result.failures ?? []).forEach((failure) => expect(failure.reason).toMatch(/locked/));
      expect(prisma.journal.create).not.toHaveBeenCalled();
    });
  });
});
