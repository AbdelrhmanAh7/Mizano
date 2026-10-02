import { BadRequestException } from '@nestjs/common';
import { BankAccountType } from '@prisma/client';
import { BankAccountsService } from './bank-accounts.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { createMockPrisma, MockPrismaClient } from '../../../test/mocks/prisma.mock';

const ORG = 'org-1';

describe('BankAccountsService.create opening balance', () => {
  let prisma: MockPrismaClient;
  let service: BankAccountsService;

  const dto = (extra: Record<string, unknown> = {}) =>
    ({
      name: 'Main',
      type: BankAccountType.BANK,
      linkedAccountId: 'acc-bank',
      ...extra,
    }) as never;

  beforeEach(() => {
    prisma = createMockPrisma();
    prisma.account.findFirst.mockResolvedValue({ id: 'acc-bank' } as never);
    prisma.bankAccount.create.mockResolvedValue({ id: 'ba-1' } as never);
    service = new BankAccountsService(prisma as unknown as PrismaService);
  });

  it.each(['5000.50', '-10', '0.0001'])('rejects a non-zero opening balance (%s)', async (v) => {
    const call = service.create(ORG, dto({ openingBalance: v }));

    await expect(call).rejects.toThrow(BadRequestException);
    await expect(call).rejects.toThrow(/Opening Balances/);
    expect(prisma.bankAccount.create).not.toHaveBeenCalled();
  });

  it('allows a missing or zero opening balance and stores zero balances', async () => {
    await service.create(ORG, dto());
    await service.create(ORG, dto({ openingBalance: '0.00' }));

    expect(prisma.bankAccount.create).toHaveBeenCalledTimes(2);
    const data = prisma.bankAccount.create.mock.calls[0][0].data;
    expect(data.systemBalance?.toString()).toBe('0');
    expect(data.organizationId).toBe(ORG);
  });

  it('rejects a linked account of another organization', async () => {
    prisma.account.findFirst.mockResolvedValue(null);

    await expect(service.create(ORG, dto())).rejects.toThrow(/Linked ledger account/);
    expect(prisma.account.findFirst.mock.calls[0][0]?.where).toMatchObject({
      id: 'acc-bank',
      organizationId: ORG,
      deletedAt: null,
    });
  });
});
