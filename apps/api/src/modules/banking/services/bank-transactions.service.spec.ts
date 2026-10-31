import { BadRequestException } from '@nestjs/common';
import { BankTransactionType } from '@prisma/client';
import { BankTransactionsService } from './bank-transactions.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { createMockPrisma, MockPrismaClient } from '../../../test/mocks/prisma.mock';

describe('BankTransactionsService.create', () => {
  let prisma: MockPrismaClient;
  let service: BankTransactionsService;
  const line = { date: '2026-10-31', type: BankTransactionType.DEPOSIT, bankAccountId: 'ba-1' };

  beforeEach(() => {
    prisma = createMockPrisma();
    prisma.bankAccount.findFirst.mockResolvedValue({ id: 'ba-1' } as never);
    prisma.bankTransaction.create.mockResolvedValue({ id: 'tx-1' } as never);
    prisma.bankTransaction.createMany.mockResolvedValue({ count: 1 } as never);
    service = new BankTransactionsService(prisma as unknown as PrismaService);
  });

  it('stores the exact decimal amount', async () => {
    await service.create('org-1', { ...line, amount: '250.5012' });
    const { data } = prisma.bankTransaction.create.mock.calls[0][0] as {
      data: { amount: { toString(): string } };
    };
    expect(data.amount.toString()).toBe('250.5012');
  });

  it('rejects a zero amount on create and import', async () => {
    await expect(service.create('org-1', { ...line, amount: '0' })).rejects.toThrow(
      BadRequestException,
    );
    await expect(
      service.bulkImport('org-1', 'ba-1', [{ ...line, amount: '0.00' }]),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.bankTransaction.create).not.toHaveBeenCalled();
    expect(prisma.bankTransaction.createMany).not.toHaveBeenCalled();
  });
});
