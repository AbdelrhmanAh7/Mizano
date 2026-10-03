import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { WorkOrderStatus } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../../../prisma/prisma.service';
import { createMockPrisma } from '../../../test/mocks/prisma.mock';
import { WorkOrdersService } from './work-orders.service';

const ORG = 'org-1';
const workOrder = {
  id: 'wo-1',
  workOrderNumber: 'WO-001',
  quantity: 1,
  notes: null,
  status: WorkOrderStatus.IN_PROCESS,
  bom: {
    outputItemId: 'finished',
    outputQuantity: 1,
    operationsCost: new Decimal(2),
    items: [{ itemId: 'raw', quantity: new Decimal(1), item: { costPrice: new Decimal('0.3') } }],
  },
};

/**
 * A transaction-only client. The outer client has nothing but `$transaction`, so any query that
 * bypasses the transaction (and therefore the ledger lock and the rollback) fails the test. The
 * ledger lock serializes transactions until the callback ends, like the advisory lock does.
 */
function transactional(
  options: { accounts?: boolean; overhead?: boolean; materialCost?: Decimal } = {},
) {
  const calls: string[] = [];
  const state = { open: true, exists: true, status: WorkOrderStatus.IN_PROCESS as WorkOrderStatus };
  let tail: Promise<void> = Promise.resolve();

  const tables = {
    workOrder: {
      updateMany: jest.fn(async (..._args: unknown[]) => {
        calls.push('claim');
        if (!state.exists || !state.open) return { count: 0 };
        state.open = false;
        state.status = WorkOrderStatus.COMPLETED;
        return { count: 1 };
      }),
      findFirst: jest.fn(async (args: { select?: unknown }) => {
        if (args.select) {
          calls.push('diagnose');
          return state.exists ? { status: state.status } : null;
        }
        calls.push('load');
        if (!state.exists) return null;
        const bom = options.materialCost
          ? {
              ...workOrder.bom,
              items: [
                {
                  itemId: 'raw',
                  quantity: new Decimal(1),
                  item: { costPrice: options.materialCost },
                },
              ],
            }
          : workOrder.bom;
        return { ...workOrder, bom, status: state.status };
      }),
      update: jest.fn(async (args: { data: Record<string, unknown> }) => {
        calls.push('finish');
        return { id: workOrder.id, status: WorkOrderStatus.COMPLETED, ...args.data };
      }),
    },
    productionEntry: {
      create: jest.fn(async (..._args: unknown[]) => {
        calls.push('entry');
        return { id: 'pe-1' };
      }),
    },
    warehouse: {
      findFirst: jest.fn(async (..._args: unknown[]) => {
        calls.push('warehouse');
        return { id: 'w1' };
      }),
    },
    inventoryMovement: {
      create: jest.fn(async (args: { data: { movementType: string } }) => {
        calls.push(`movement:${args.data.movementType}`);
        return {};
      }),
    },
    item: {
      findFirst: jest.fn(async (..._args: unknown[]) => {
        calls.push('item');
        return { inventoryAccountId: 'fg' };
      }),
    },
    account: {
      findFirst: jest.fn(async (args: { where?: { type?: string } }) => {
        calls.push('account');
        if (options.accounts === false) return null;
        if (options.overhead === false && args.where?.type === 'EXPENSE') return null;
        return { id: 'account' };
      }),
    },
    journal: {
      findFirst: jest.fn(async (..._args: unknown[]) => {
        calls.push('number');
        return { journalNumber: 'JRN-010' };
      }),
      create: jest.fn(async (..._args: unknown[]) => {
        calls.push('journal');
        return { id: 'j1' };
      }),
    },
  };

  const prisma = {
    $transaction: jest.fn(async (fn: (client: unknown) => Promise<unknown>) => {
      let release = () => {};
      const tx = {
        ...tables,
        $executeRaw: jest.fn(async () => {
          const previous = tail;
          tail = new Promise<void>((resolve) => {
            release = resolve;
          });
          await previous;
          calls.push('lock');
          return 1;
        }),
        $queryRaw: jest.fn(async (..._args: unknown[]) => {
          calls.push('rowlock');
          return [];
        }),
      };
      try {
        return await fn(tx);
      } finally {
        release();
      }
    }),
  };
  const service = new WorkOrdersService(prisma as unknown as PrismaService);
  return { service, prisma, tables, calls, state };
}

describe('WorkOrdersService completion', () => {
  it('posts movements, the journal and the status change in one transaction, ledger first', async () => {
    const { service, prisma, tables, calls } = transactional();

    const result = await service.completeWorkOrder(ORG, 'wo-1', { quantityProduced: 1 });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(calls).toEqual([
      'lock',
      'claim',
      'load',
      'warehouse',
      'movement:OUT',
      'warehouse',
      'movement:IN',
      'item',
      'account',
      'account',
      'number',
      'account',
      'journal',
      'finish',
    ]);
    expect(tables.workOrder.updateMany).toHaveBeenCalledWith({
      where: { id: 'wo-1', organizationId: ORG, deletedAt: null, status: 'IN_PROCESS' },
      data: { status: 'COMPLETED', completedDate: expect.any(Date) },
    });
    expect(tables.workOrder.update).toHaveBeenCalledWith({
      where: { id: 'wo-1', organizationId: ORG },
      data: { notes: null, journalId: 'j1' },
    });
    expect(result).toMatchObject({ status: 'COMPLETED', journalId: 'j1' });
    for (const [args] of tables.inventoryMovement.create.mock.calls) {
      expect(args.data).toMatchObject({ organizationId: ORG, referenceType: 'workOrder' });
    }
  });

  it('posts a balanced COGM journal scoped to the organization and numbered after the lock', async () => {
    const { service, tables } = transactional();

    await service.completeWorkOrder(ORG, 'wo-1', { quantityProduced: 1 });

    expect(tables.item.findFirst).toHaveBeenCalledWith({
      where: { id: 'finished', organizationId: ORG },
      select: { inventoryAccountId: true },
    });
    for (const [args] of tables.account.findFirst.mock.calls) {
      expect((args as { where: { organizationId: string } }).where.organizationId).toBe(ORG);
    }
    const journal = tables.journal.create.mock.calls[0][0] as {
      data: {
        journalNumber: string;
        organizationId: string;
        lines: { create: { debit: Decimal; credit: Decimal }[] };
      };
    };
    expect(journal.data).toMatchObject({ journalNumber: 'JRN-011', organizationId: ORG });
    const lines = journal.data.lines.create;
    const debit = lines.reduce((sum, l) => sum.add(l.debit), new Decimal(0));
    const credit = lines.reduce((sum, l) => sum.add(l.credit), new Decimal(0));
    expect(debit.toFixed(4)).toBe('2.3000');
    expect(credit.equals(debit)).toBe(true);
  });

  it('credits operations cost to raw materials when there is no material cost or overhead account', async () => {
    const { service, tables } = transactional({ overhead: false, materialCost: new Decimal(0) });

    await service.completeWorkOrder(ORG, 'wo-1', { quantityProduced: 1 });

    const journal = tables.journal.create.mock.calls[0][0] as {
      data: { lines: { create: { debit: Decimal; credit: Decimal }[] } };
    };
    const lines = journal.data.lines.create;
    const debit = lines.reduce((sum, l) => sum.add(l.debit), new Decimal(0));
    const credit = lines.reduce((sum, l) => sum.add(l.credit), new Decimal(0));
    expect(debit.toFixed(4)).toBe('2.0000');
    expect(credit.toFixed(4)).toBe('2.0000');
  });

  it('completes without a journal when the inventory accounts are missing', async () => {
    const { service, tables } = transactional({ accounts: false });

    await service.completeWorkOrder(ORG, 'wo-1', { quantityProduced: 1 });

    expect(tables.journal.findFirst).not.toHaveBeenCalled();
    expect(tables.journal.create).not.toHaveBeenCalled();
    expect(tables.workOrder.update).toHaveBeenCalledWith({
      where: { id: 'wo-1', organizationId: ORG },
      data: { notes: null, journalId: null },
    });
  });

  it('a failure while posting never reaches the final update', async () => {
    const { service, tables, calls } = transactional();
    tables.journal.create.mockRejectedValue(new Error('boom'));

    await expect(service.completeWorkOrder(ORG, 'wo-1', { quantityProduced: 1 })).rejects.toThrow(
      'boom',
    );

    // Everything above ran on the transaction client, so the database rolls the claim and the
    // movements back with it; nothing finishes the work order.
    expect(calls).not.toContain('finish');
  });

  it('a retry of a completed work order posts nothing a second time', async () => {
    const { service, tables } = transactional();
    await service.completeWorkOrder(ORG, 'wo-1', { quantityProduced: 1 });

    await expect(service.completeWorkOrder(ORG, 'wo-1', { quantityProduced: 1 })).rejects.toThrow(
      new BadRequestException('Work order is not in process'),
    );

    expect(tables.inventoryMovement.create).toHaveBeenCalledTimes(2);
    expect(tables.journal.create).toHaveBeenCalledTimes(1);
    expect(tables.workOrder.update).toHaveBeenCalledTimes(1);
  });

  it('two concurrent completions post once: the second waits for the lock and finds it closed', async () => {
    const { service, tables, calls } = transactional();

    const results = await Promise.allSettled([
      service.completeWorkOrder(ORG, 'wo-1', { quantityProduced: 1 }),
      service.completeWorkOrder(ORG, 'wo-1', { quantityProduced: 1 }),
    ]);

    expect(results.map((r) => r.status).sort()).toEqual(['fulfilled', 'rejected']);
    const rejected = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(rejected.reason).toBeInstanceOf(BadRequestException);
    expect(tables.inventoryMovement.create).toHaveBeenCalledTimes(2);
    expect(tables.journal.create).toHaveBeenCalledTimes(1);
    expect(tables.workOrder.update).toHaveBeenCalledTimes(1);
    // The loser claimed only after the winner's whole transaction.
    expect(calls.indexOf('finish')).toBeLessThan(calls.lastIndexOf('claim'));
  });

  it('is a 404 for an unknown, deleted or foreign work order and posts nothing', async () => {
    const { service, tables, state } = transactional();
    state.exists = false;

    await expect(
      service.completeWorkOrder(ORG, 'wo-other', { quantityProduced: 1 }),
    ).rejects.toThrow(NotFoundException);

    expect(tables.workOrder.findFirst).toHaveBeenCalledWith({
      where: { id: 'wo-other', organizationId: ORG, deletedAt: null },
      select: { status: true },
    });
    expect(tables.inventoryMovement.create).not.toHaveBeenCalled();
    expect(tables.journal.create).not.toHaveBeenCalled();
  });

  it.each([WorkOrderStatus.DRAFT, WorkOrderStatus.CANCELLED])(
    'refuses a %s work order and posts nothing',
    async (status) => {
      const { service, tables, state } = transactional();
      state.open = false;
      state.status = status;

      await expect(service.completeWorkOrder(ORG, 'wo-1', { quantityProduced: 1 })).rejects.toThrow(
        'Work order is not in process',
      );

      expect(tables.inventoryMovement.create).not.toHaveBeenCalled();
      expect(tables.journal.create).not.toHaveBeenCalled();
    },
  );

  it.each([Number.NaN, -1, Number.POSITIVE_INFINITY])(
    'rejects the produced quantity %s before opening a transaction',
    async (quantityProduced) => {
      const { service, prisma } = transactional();

      await expect(service.completeWorkOrder(ORG, 'wo-1', { quantityProduced })).rejects.toThrow(
        BadRequestException,
      );

      expect(prisma.$transaction).not.toHaveBeenCalled();
    },
  );
});

describe('WorkOrdersService production entries', () => {
  it('records the entry and its movements in one transaction behind a row lock', async () => {
    const { service, prisma, tables, calls } = transactional();

    const entry = await service.recordProduction(ORG, 'wo-1', { quantityProduced: 1 });

    expect(entry).toEqual({ id: 'pe-1' });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(calls).toEqual([
      'rowlock',
      'load',
      'entry',
      'warehouse',
      'movement:OUT',
      'warehouse',
      'movement:IN',
    ]);
    expect(tables.productionEntry.create.mock.calls[0][0]).toMatchObject({
      data: { workOrderId: 'wo-1', organizationId: ORG },
    });
  });

  it('refuses a work order that is no longer in process and records nothing', async () => {
    const { service, tables, state } = transactional();
    state.status = WorkOrderStatus.COMPLETED;

    await expect(service.recordProduction(ORG, 'wo-1', { quantityProduced: 1 })).rejects.toThrow(
      'Work order is not in process',
    );

    expect(tables.productionEntry.create).not.toHaveBeenCalled();
    expect(tables.inventoryMovement.create).not.toHaveBeenCalled();
  });

  it('is a 404 for another organization', async () => {
    const { service, tables, state } = transactional();
    state.exists = false;

    await expect(service.recordProduction(ORG, 'wo-1', { quantityProduced: 1 })).rejects.toThrow(
      NotFoundException,
    );

    expect(tables.workOrder.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'wo-1', organizationId: ORG, deletedAt: null } }),
    );
    expect(tables.productionEntry.create).not.toHaveBeenCalled();
  });
});

describe('WorkOrdersService cancellation', () => {
  function build(status: WorkOrderStatus, count = 1) {
    const prisma = createMockPrisma();
    prisma.workOrder.findFirst.mockResolvedValue({ ...workOrder, status } as never);
    prisma.workOrder.updateMany.mockResolvedValue({ count });
    prisma.workOrder.findFirstOrThrow.mockResolvedValue({
      id: 'wo-1',
      status: 'CANCELLED',
    } as never);
    return { prisma, service: new WorkOrdersService(prisma as unknown as PrismaService) };
  }

  it('cancels with a guarded transition scoped to the organization', async () => {
    const { prisma, service } = build(WorkOrderStatus.IN_PROCESS);

    const result = await service.cancelWorkOrder(ORG, 'wo-1', 'no demand');

    expect(prisma.workOrder.updateMany).toHaveBeenCalledWith({
      where: { id: 'wo-1', organizationId: ORG, deletedAt: null, status: { not: 'COMPLETED' } },
      data: { status: 'CANCELLED', notes: '\nCancelled: no demand' },
    });
    expect(prisma.workOrder.update).not.toHaveBeenCalled();
    expect(result).toMatchObject({ status: 'CANCELLED' });
  });

  it('does not overwrite a completion that committed after the read', async () => {
    const { prisma, service } = build(WorkOrderStatus.IN_PROCESS, 0);

    await expect(service.cancelWorkOrder(ORG, 'wo-1', 'late')).rejects.toThrow(ConflictException);

    expect(prisma.workOrder.findFirstOrThrow).not.toHaveBeenCalled();
  });

  it('refuses a completed work order up front', async () => {
    const { prisma, service } = build(WorkOrderStatus.COMPLETED);

    await expect(service.cancelWorkOrder(ORG, 'wo-1', 'x')).rejects.toThrow(
      'Cannot cancel completed work order',
    );

    expect(prisma.workOrder.updateMany).not.toHaveBeenCalled();
  });
});

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
