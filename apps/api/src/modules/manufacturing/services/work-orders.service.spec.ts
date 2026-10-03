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
  bom: {
    outputItemId: 'finished',
    outputQuantity: 1,
    operationsCost: new Decimal(2),
    items: [{ itemId: 'raw', quantity: new Decimal(1), item: { costPrice: new Decimal('0.3') } }],
  },
};

describe('WorkOrdersService posting lock', () => {
  it('reads posting items/accounts and generates the number only after the ledger lock', async () => {
    const prisma = createMockPrisma();
    const calls: string[] = [];
    (prisma.$executeRaw as jest.Mock).mockImplementation(async () => {
      calls.push('lock');
      return 1;
    });
    (prisma.item.findFirst as jest.Mock).mockImplementation(async () => {
      calls.push('item');
      return { inventoryAccountId: 'fg' } as never;
    });
    (prisma.account.findFirst as jest.Mock).mockImplementation(async () => {
      calls.push('account');
      return { id: 'account' } as never;
    });
    (prisma.journal.findFirst as jest.Mock).mockImplementation(async () => {
      calls.push('number');
      return { journalNumber: 'JRN-010' } as never;
    });
    (prisma.journal.create as jest.Mock).mockImplementation(async () => {
      calls.push('journal');
      return { id: 'j1' } as never;
    });
    const service = new WorkOrdersService(prisma as unknown as PrismaService);

    expect(await service['createCOGMJournal'](ORG, workOrder, 1)).toBe('j1');
    expect(calls).toEqual(['lock', 'item', 'account', 'account', 'number', 'account', 'journal']);
    expect(prisma.item.findFirst).toHaveBeenCalledWith({
      where: { id: 'finished', organizationId: ORG },
      select: { inventoryAccountId: true },
    });
    for (const [args] of prisma.account.findFirst.mock.calls)
      expect(args?.where?.organizationId).toBe(ORG);
    expect(prisma.journal.create.mock.calls[0][0].data).toMatchObject({
      journalNumber: 'JRN-011',
      organizationId: ORG,
    });
  });

  it('skips posting when accounts are missing in the locked transaction', async () => {
    const prisma = createMockPrisma();
    prisma.account.findFirst.mockResolvedValue(null);
    const service = new WorkOrdersService(prisma as unknown as PrismaService);
    expect(await service['createCOGMJournal'](ORG, workOrder, 1)).toBeNull();
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
    expect(prisma.journal.findFirst).not.toHaveBeenCalled();
    expect(prisma.journal.create).not.toHaveBeenCalled();
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
