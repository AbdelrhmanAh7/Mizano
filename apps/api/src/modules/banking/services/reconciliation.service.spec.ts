import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { dec } from '../../../test/helpers/decimal.helpers';
import { createMockPrisma } from '../../../test/mocks/prisma.mock';
import { ReconciliationService } from './reconciliation.service';

/* eslint-disable @typescript-eslint/no-explicit-any */
describe('ReconciliationService.createExpenseFromTransaction', () => {
  const ORG = 'org-1';
  let prisma: any;
  let expenses: { create: jest.Mock };
  let service: ReconciliationService;

  const transaction = {
    id: 't1',
    bankAccountId: 'ba1',
    date: new Date('2026-03-05T00:00:00.000Z'),
    type: 'WITHDRAWAL',
    amount: dec('-250.5'),
    description: 'Stationery',
    reference: 'REF-1',
    status: 'PENDING',
    organizationId: ORG,
  };

  beforeEach(() => {
    prisma = createMockPrisma();
    expenses = { create: jest.fn().mockResolvedValue({ id: 'e1' }) };
    service = new ReconciliationService(
      prisma as unknown as PrismaService,
      {} as never,
      {} as never,
      expenses as never,
    );
    prisma.bankTransaction.findFirst.mockResolvedValue(transaction);
    prisma.bankTransaction.updateMany.mockResolvedValue({ count: 1 });
    prisma.bankAccount.findFirst.mockResolvedValue({ linkedAccountId: 'bank-ledger' });
  });

  it('posts the expense through ExpensesService inside the transaction, paid from the bank ledger account', async () => {
    await service.createExpenseFromTransaction(ORG, 't1', 'exp-acc', 'v1');

    expect(prisma.bankTransaction.updateMany.mock.calls[0][0]).toEqual({
      where: { id: 't1', organizationId: ORG, status: 'PENDING' },
      data: { status: 'CREATED' },
    });
    expect(expenses.create).toHaveBeenCalledWith(
      ORG,
      {
        date: transaction.date.toISOString(),
        accountId: 'exp-acc',
        vendorId: 'v1',
        amount: '250.5000',
        paidThroughAccountId: 'bank-ledger',
        description: 'Stationery',
        reference: 'REF-1',
      },
      { tx: prisma },
    );
    expect(prisma.expense.create).not.toHaveBeenCalled();
  });

  it('rolls back the transition when the expense command rejects', async () => {
    expenses.create.mockRejectedValue(new BadRequestException('Expense account must be active'));
    await expect(service.createExpenseFromTransaction(ORG, 't1', 'bad')).rejects.toThrow(
      'Expense account must be active',
    );
    // The transition and the expense share one $transaction callback, so the rejection aborts both.
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('a retry loses the guarded PENDING -> CREATED transition and creates no second expense', async () => {
    prisma.bankTransaction.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.createExpenseFromTransaction(ORG, 't1', 'exp-acc')).rejects.toThrow(
      /Already reconciled/,
    );
    expect(expenses.create).not.toHaveBeenCalled();
  });

  it('rejects an already reconciled transaction and a deposit', async () => {
    prisma.bankTransaction.findFirst.mockResolvedValue({ ...transaction, status: 'MATCHED' });
    await expect(service.createExpenseFromTransaction(ORG, 't1', 'exp-acc')).rejects.toThrow(
      /Already reconciled/,
    );
    prisma.bankTransaction.findFirst.mockResolvedValue({ ...transaction, type: 'DEPOSIT' });
    await expect(service.createExpenseFromTransaction(ORG, 't1', 'exp-acc')).rejects.toThrow(
      /Only withdrawals/,
    );
    expect(expenses.create).not.toHaveBeenCalled();
  });

  it('cannot use a transaction of another organization', async () => {
    prisma.bankTransaction.findFirst.mockResolvedValue(null);
    await expect(service.createExpenseFromTransaction(ORG, 'foreign', 'exp-acc')).rejects.toThrow(
      NotFoundException,
    );
    expect(prisma.bankTransaction.findFirst.mock.calls[0][0].where).toEqual({
      id: 'foreign',
      organizationId: ORG,
    });
  });
});
