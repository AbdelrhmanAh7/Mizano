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

describe('BankAccountsService.update linked account ownership', () => {
  let prisma: MockPrismaClient;
  let service: BankAccountsService;

  beforeEach(() => {
    prisma = createMockPrisma();
    prisma.bankAccount.findFirst.mockResolvedValue({ id: 'ba-1' } as never);
    prisma.bankAccount.update.mockResolvedValue({ id: 'ba-1' } as never);
    service = new BankAccountsService(prisma as unknown as PrismaService);
  });

  it('rejects (400) a linked ledger account of another organization and writes nothing', async () => {
    prisma.account.findFirst.mockResolvedValue(null);

    await expect(service.update(ORG, 'ba-1', { linkedAccountId: 'foreign-acc' })).rejects.toThrow(
      /Linked ledger account/,
    );
    expect(prisma.account.findFirst.mock.calls[0]![0]!.where).toMatchObject({
      id: 'foreign-acc',
      organizationId: ORG,
      deletedAt: null,
    });
    expect(prisma.bankAccount.update).not.toHaveBeenCalled();
  });

  it('does not look up an account when the link is not part of the update', async () => {
    await service.update(ORG, 'ba-1', { name: 'Renamed' });

    expect(prisma.account.findFirst).not.toHaveBeenCalled();
    expect(prisma.bankAccount.update).toHaveBeenCalledTimes(1);
  });

  it('accepts an own ledger account', async () => {
    prisma.account.findFirst.mockResolvedValue({ id: 'acc-2' } as never);

    await service.update(ORG, 'ba-1', { linkedAccountId: 'acc-2' });

    expect(prisma.bankAccount.update).toHaveBeenCalledTimes(1);
  });

  it('rejects (400) when linkedAccountId is null', async () => {
    await expect(service.update(ORG, 'ba-1', { linkedAccountId: null as never })).rejects.toThrow(
      /Linked ledger account/,
    );
    expect(prisma.account.findFirst).not.toHaveBeenCalled();
    expect(prisma.bankAccount.update).not.toHaveBeenCalled();
  });
});
