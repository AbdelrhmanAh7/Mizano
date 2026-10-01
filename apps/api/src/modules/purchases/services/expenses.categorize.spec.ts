import { PrismaService } from '../../../prisma/prisma.service';
import { createMockPrisma } from '../../../test/mocks/prisma.mock';
import { JournalsService } from '../../accounting/services/journals.service';
import { ExpensesService } from './expenses.service';

/* eslint-disable @typescript-eslint/no-explicit-any */
describe('ExpensesService.bulkCategorize', () => {
  const ORG = 'org-1';
  let prisma: any;
  let service: ExpensesService;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new ExpensesService(prisma as unknown as PrismaService, {} as JournalsService);
    prisma.account.findFirst.mockResolvedValue({ id: 'new-acc' });
  });

  it('re-categorises a PENDING expense under a status guard', async () => {
    prisma.expense.findFirst.mockResolvedValue({ id: 'e1', status: 'PENDING' });
    prisma.expense.updateMany.mockResolvedValue({ count: 1 });

    const result = await service.bulkCategorize(ORG, ['e1'], 'new-acc');

    expect(result.processed).toBe(1);
    expect(prisma.expense.updateMany.mock.calls[0][0]).toEqual({
      where: { id: 'e1', organizationId: ORG, deletedAt: null, status: 'PENDING' },
      data: { accountId: 'new-acc' },
    });
    expect(prisma.account.findFirst.mock.calls[0][0].where).toMatchObject({
      id: 'new-acc',
      organizationId: ORG,
      type: 'EXPENSE',
    });
  });

  it('still rejects POSTED expenses per record', async () => {
    prisma.expense.findFirst.mockResolvedValue({ id: 'e1', status: 'POSTED' });
    prisma.expense.updateMany.mockResolvedValue({ count: 0 });

    const result = await service.bulkCategorize(ORG, ['e1'], 'new-acc');

    expect(result.processed).toBe(0);
    expect(result.failures?.[0]?.reason).toMatch(/cannot be re-categorised/);
  });

  it('rejects a non-expense target account and unknown expenses', async () => {
    prisma.account.findFirst.mockResolvedValueOnce(null);
    const bad = await service.bulkCategorize(ORG, ['e1'], 'liability');
    expect(bad.failures?.[0]?.reason).toMatch(/expense account/);
    expect(prisma.expense.updateMany).not.toHaveBeenCalled();

    prisma.expense.findFirst.mockResolvedValue(null);
    const missing = await service.bulkCategorize(ORG, ['nope'], 'new-acc');
    expect(missing.failures?.[0]?.reason).toBe('Expense not found');
  });
});
