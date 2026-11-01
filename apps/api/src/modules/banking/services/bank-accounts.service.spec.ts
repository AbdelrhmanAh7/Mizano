import { BadRequestException, ConflictException } from '@nestjs/common';
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

describe('BankAccountsService balances', () => {
  let prisma: MockPrismaClient;
  let service: BankAccountsService;

  beforeEach(() => {
    prisma = createMockPrisma();
    prisma.bankAccount.findMany.mockResolvedValue([
      { id: 'ba-1', linkedAccountId: 'acc-1010', systemBalance: '0' },
      { id: 'ba-2', linkedAccountId: 'acc-1000', systemBalance: '0' },
    ] as never);
    prisma.bankAccount.count.mockResolvedValue(2 as never);
    prisma.bankTransaction.count.mockResolvedValue(0 as never);
    prisma.journalLine.groupBy.mockResolvedValue([
      { accountId: 'acc-1010', _sum: { debit: '10542.4700', credit: '0' } },
      { accountId: 'acc-1000', _sum: { debit: '100', credit: '364.2500' } },
    ] as never);
    service = new BankAccountsService(prisma as unknown as PrismaService);
  });

  it('lists each bank account with its linked ledger balance, not the stale stored 0', async () => {
    const { data } = await service.findAll(ORG);
    expect(data.map((a) => a.systemBalance)).toEqual(['10542.4700', '-264.2500']);
    const where = (prisma.journalLine.groupBy.mock.calls[0][0] as { where: { journal: object } })
      .where;
    expect(where.journal).toEqual(expect.objectContaining({ organizationId: ORG }));
  });

  it('totals the stats from the same ledger balances, exactly', async () => {
    const stats = await service.getDashboardStats(ORG);
    expect(stats.totalSystemBalance).toBe('10278.2200');
  });
});

describe('BankAccountsService one bank record per ledger account (#663)', () => {
  let prisma: MockPrismaClient;
  let service: BankAccountsService;

  beforeEach(() => {
    prisma = createMockPrisma();
    prisma.account.findFirst.mockResolvedValue({ id: 'acc-1010' } as never);
    prisma.bankAccount.create.mockResolvedValue({ id: 'ba-new' } as never);
    prisma.bankAccount.update.mockResolvedValue({ id: 'ba-2' } as never);
    prisma.journalLine.groupBy.mockResolvedValue([] as never);
    service = new BankAccountsService(prisma as unknown as PrismaService);
  });

  it('counts a ledger balance once when two bank records share its ledger account', async () => {
    prisma.bankAccount.findMany.mockResolvedValue([
      { linkedAccountId: 'acc-1000' },
      { linkedAccountId: 'acc-1010' },
      { linkedAccountId: 'acc-1010' },
    ] as never);
    prisma.bankTransaction.count.mockResolvedValue(0 as never);
    prisma.journalLine.groupBy.mockResolvedValue([
      { accountId: 'acc-1010', _sum: { debit: '20798', credit: '0' } },
    ] as never);

    const stats = await service.getDashboardStats(ORG);

    expect(stats.totalSystemBalance).toBe('20798.0000');
    expect(stats.totalAccounts).toBe(3);
  });

  it('refuses a new bank account on a ledger account another bank account uses', async () => {
    prisma.bankAccount.findFirst.mockResolvedValue({ name: 'Test Bank' } as never);

    const call = service.create(ORG, {
      name: 'Test Bank 2',
      type: BankAccountType.BANK,
      linkedAccountId: 'acc-1010',
    } as never);

    await expect(call).rejects.toThrow(ConflictException);
    await expect(call).rejects.toThrow(
      'This ledger account is already linked to the bank account "Test Bank". Each bank account needs its own ledger account.',
    );
    expect(prisma.bankAccount.findFirst.mock.calls[0][0]?.where).toEqual({
      organizationId: ORG,
      linkedAccountId: 'acc-1010',
      deletedAt: null,
    });
    expect(prisma.bankAccount.create).not.toHaveBeenCalled();
  });

  it('refuses moving a bank account onto a ledger account another bank account uses', async () => {
    prisma.bankAccount.findFirst
      .mockResolvedValueOnce({ id: 'ba-2', linkedAccountId: 'acc-1020' } as never)
      .mockResolvedValueOnce({ name: 'Test Bank' } as never);

    await expect(service.update(ORG, 'ba-2', { linkedAccountId: 'acc-1010' })).rejects.toThrow(
      ConflictException,
    );
    expect(prisma.bankAccount.findFirst.mock.calls[1][0]?.where).toEqual({
      organizationId: ORG,
      linkedAccountId: 'acc-1010',
      deletedAt: null,
      id: { not: 'ba-2' },
    });
    expect(prisma.bankAccount.update).not.toHaveBeenCalled();
  });

  it("refuses moving a bank account onto another organization's ledger account", async () => {
    prisma.bankAccount.findFirst
      .mockResolvedValueOnce({ id: 'ba-2', linkedAccountId: 'acc-1020' } as never)
      .mockResolvedValueOnce(null);
    prisma.account.findFirst.mockResolvedValue(null);

    await expect(service.update(ORG, 'ba-2', { linkedAccountId: 'acc-other' })).rejects.toThrow(
      /Linked ledger account not found/,
    );
    expect(prisma.account.findFirst.mock.calls[0][0]?.where).toMatchObject({
      id: 'acc-other',
      organizationId: ORG,
    });
    expect(prisma.bankAccount.update).not.toHaveBeenCalled();
  });

  it('renames a bank account without re-checking its own ledger account', async () => {
    prisma.bankAccount.findFirst.mockResolvedValueOnce({
      id: 'ba-2',
      linkedAccountId: 'acc-1010',
    } as never);

    await service.update(ORG, 'ba-2', { name: 'Renamed', linkedAccountId: 'acc-1010' });

    expect(prisma.account.findFirst).not.toHaveBeenCalled();
    expect(prisma.bankAccount.update).toHaveBeenCalledTimes(1);
  });
});
