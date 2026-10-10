import { Decimal } from '@prisma/client/runtime/library';
import { createMockPrisma } from '../../../test/mocks/prisma.mock';
import { bankBookBalances, money, totalBankBookBalance } from './report-utils';

describe('bank book totals', () => {
  it('retains duplicate-linked bank detail rows but counts their ledger balance once', async () => {
    const prisma = createMockPrisma();
    prisma.bankAccount.findMany.mockResolvedValue([
      { id: 'b1', name: 'Main', linkedAccountId: 'ledger-1' },
      { id: 'b2', name: 'Other register', linkedAccountId: 'ledger-1' },
      { id: 'b3', name: 'Savings', linkedAccountId: 'ledger-2' },
    ] as never);
    prisma.journalLine.groupBy.mockResolvedValue([
      { accountId: 'ledger-1', _sum: { debit: new Decimal('0.1'), credit: new Decimal(0) } },
      { accountId: 'ledger-2', _sum: { debit: new Decimal('0.2'), credit: new Decimal(0) } },
    ] as never);
    const cutoff = new Date('2026-02-28T23:59:59.999Z');
    const banks = await bankBookBalances(prisma, 'org-1', cutoff);
    expect(banks).toHaveLength(3);
    expect(banks.map((bank) => money(bank.balance))).toEqual(['0.1000', '0.1000', '0.2000']);
    expect(money(totalBankBookBalance(banks))).toBe('0.3000');
    expect(prisma.bankAccount.findMany).toHaveBeenCalledWith({
      where: { organizationId: 'org-1', isActive: true, deletedAt: null },
      select: { id: true, name: true, linkedAccountId: true },
    });
    expect(prisma.journalLine.groupBy).toHaveBeenCalledWith({
      by: ['accountId'],
      where: {
        accountId: { in: ['ledger-1', 'ledger-2'] },
        journal: {
          organizationId: 'org-1',
          isPosted: true,
          deletedAt: null,
          date: { lte: cutoff },
        },
      },
      _sum: { debit: true, credit: true },
    });
  });

  it('preserves fractions while large positive and negative ledger balances cancel', () => {
    const rows = ['999999999999999.0001', '-999999999999999.0000', '0.4999'].map(
      (value, index) => ({
        id: `bank-${index}`,
        name: 'Bank',
        linkedAccountId: `ledger-${index}`,
        balance: new Decimal(value),
      }),
    );
    expect(money(totalBankBookBalance(rows))).toBe('0.5000');
  });

  it('returns exact zero for no banks without issuing a ledger query', async () => {
    const prisma = createMockPrisma();
    prisma.bankAccount.findMany.mockResolvedValue([]);
    expect(money(totalBankBookBalance(await bankBookBalances(prisma, 'org-1')))).toBe('0.0000');
    expect(prisma.journalLine.groupBy).not.toHaveBeenCalled();
  });
});
