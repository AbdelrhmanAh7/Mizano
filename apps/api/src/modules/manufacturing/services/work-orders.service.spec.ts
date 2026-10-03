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
