import { NotFoundException } from '@nestjs/common';
import { AccountType } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { AccountingReportsService } from './accounting-reports.service';
import { AccountsService } from './accounts.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { createMockPrisma, MockPrismaClient } from '../../../test/mocks/prisma.mock';

const ORG_ID = 'org-test-001';
const D = (v: string | number): Decimal => new Decimal(v);

const ACCOUNTS = [
  { id: 'cash', code: '1000', name: 'Cash', type: AccountType.ASSET, openingBalance: D('999') },
  { id: 'ap', code: '2000', name: 'AP', type: AccountType.LIABILITY, openingBalance: D('999') },
  {
    id: 'eq',
    code: '3900',
    name: 'Opening Equity',
    type: AccountType.EQUITY,
    openingBalance: D(0),
  },
  { id: 'rev', code: '4000', name: 'Sales', type: AccountType.REVENUE, openingBalance: D('999') },
  { id: 'exp', code: '6100', name: 'Rent', type: AccountType.EXPENSE, openingBalance: D(0) },
  { id: 'idle', code: '9999', name: 'Idle', type: AccountType.ASSET, openingBalance: D('999') },
];

type Sum = { accountId: string; debit: string; credit: string };

describe('AccountingReportsService', () => {
  let service: AccountingReportsService;
  let prisma: MockPrismaClient;

  function ledger(sums: Sum[]): void {
    prisma.account.findMany.mockResolvedValue(ACCOUNTS as never);
    prisma.journalLine.groupBy.mockResolvedValue(
      sums.map((s) => ({
        accountId: s.accountId,
        _sum: { debit: D(s.debit), credit: D(s.credit) },
      })) as never,
    );
  }

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new AccountingReportsService(prisma as unknown as PrismaService);
  });

  describe('getTrialBalance', () => {
    it('is balanced, uses one grouped query and never reads Account.openingBalance', async () => {
      ledger([
        { accountId: 'cash', debit: '5000.50', credit: '114' },
        { accountId: 'eq', debit: '0', credit: '5000.50' },
        { accountId: 'exp', debit: '114', credit: '0' },
      ]);

      const result = await service.getTrialBalance(ORG_ID);

      expect(prisma.journalLine.groupBy).toHaveBeenCalledTimes(1);
      expect(prisma.journalLine.aggregate).not.toHaveBeenCalled();
      expect(result.accounts.map((a) => [a.code, a.debit.toString(), a.credit.toString()])).toEqual(
        [
          ['1000', '4886.5', '0'],
          ['3900', '0', '5000.5'],
          ['6100', '114', '0'],
        ],
      );
      expect(result.totals.totalDebits.toString()).toBe('5000.5');
      expect(result.totals.totalCredits.toString()).toBe('5000.5');
      expect(result.isBalanced).toBe(true);
    });

    it('queries posted, non-deleted journals of the organization with an end-of-day bound', async () => {
      ledger([]);

      const result = await service.getTrialBalance(ORG_ID, '2026-03-31');

      const where = prisma.journalLine.groupBy.mock.calls[0][0].where as {
        journal: {
          organizationId: string;
          isPosted: boolean;
          deletedAt: null;
          date: { lte: Date };
        };
      };
      expect(where.journal).toMatchObject({
        organizationId: ORG_ID,
        isPosted: true,
        deletedAt: null,
      });
      expect(where.journal.date.lte.toISOString()).toBe('2026-03-31T23:59:59.999Z');
      expect(prisma.account.findMany.mock.calls[0][0]?.where).toMatchObject({
        organizationId: ORG_ID,
        deletedAt: null,
      });
      expect(result.asOfDate).toBe('2026-03-31');
      expect(result.accounts).toEqual([]);
    });

    it('puts a contra balance on the opposite side and sums 0.1 + 0.2 exactly', async () => {
      ledger([
        { accountId: 'cash', debit: '0.1', credit: '0' },
        { accountId: 'exp', debit: '0.2', credit: '0' },
        { accountId: 'ap', debit: '0.05', credit: '0' }, // debit balance on a credit-normal account
        { accountId: 'rev', debit: '0', credit: '0.25' },
      ]);

      const result = await service.getTrialBalance(ORG_ID);

      const ap = result.accounts.find((a) => a.code === '2000');
      expect(ap?.debit.toString()).toBe('0.05');
      expect(ap?.credit.toString()).toBe('0');
      expect(result.totals.totalDebits.toString()).toBe('0.35');
      expect(result.totals.totalCredits.toString()).toBe('0.25');
      expect(result.isBalanced).toBe(false);
    });

    it('omits zero-balance accounts', async () => {
      ledger([{ accountId: 'cash', debit: '10', credit: '10' }]);
      expect((await service.getTrialBalance(ORG_ID)).accounts).toEqual([]);
    });
  });

  describe('getGeneralLedger', () => {
    it('throws NotFoundException for an account of another organization', async () => {
      prisma.account.findFirst.mockResolvedValue(null);

      await expect(service.getGeneralLedger(ORG_ID, 'nonexistent')).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.account.findFirst.mock.calls[0][0]?.where).toMatchObject({
        organizationId: ORG_ID,
      });
    });

    it('opens from prior posted lines (not Account.openingBalance) and runs exact balances', async () => {
      prisma.account.findFirst.mockResolvedValue(ACCOUNTS[0] as never);
      prisma.journalLine.groupBy.mockResolvedValue([
        { accountId: 'cash', _sum: { debit: D('5000.50'), credit: D('0') } },
      ] as never);
      prisma.journalLine.findMany.mockResolvedValue([
        {
          debit: D('0.1'),
          credit: D(0),
          description: 'a',
          journal: { id: 'j1', journalNumber: 'JRN-1', date: new Date('2026-02-01'), notes: null },
        },
        {
          debit: D('0.2'),
          credit: D(0),
          description: null,
          journal: { id: 'j2', journalNumber: 'JRN-2', date: new Date('2026-02-02'), notes: 'n' },
        },
      ] as never);

      const result = await service.getGeneralLedger(ORG_ID, 'cash', '2026-02-01', '2026-02-28');

      expect(result.openingBalance).toBe('5000.5000');
      expect(result.entries.map((e) => e.runningBalance)).toEqual(['5000.6000', '5000.8000']);
      expect(result.closingBalance).toBe('5000.8000');
      expect(result.entries[1].description).toBe('n');
      const prior = prisma.journalLine.groupBy.mock.calls[0][0].where as {
        journal: { date: { lt: Date }; isPosted: boolean };
      };
      expect(prior.journal.isPosted).toBe(true);
      expect(prior.journal.date.lt.toISOString()).toBe('2026-02-01T00:00:00.000Z');
      const lines = prisma.journalLine.findMany.mock.calls[0][0]?.where as {
        journal: { date: { lte: Date } };
      };
      expect(lines.journal.date.lte.toISOString()).toBe('2026-02-28T23:59:59.999Z');
    });

    it('starts at zero without a from date even if the account stores an opening balance', async () => {
      prisma.account.findFirst.mockResolvedValue(ACCOUNTS[0] as never);
      prisma.journalLine.findMany.mockResolvedValue([] as never);

      const result = await service.getGeneralLedger(ORG_ID, 'cash');

      expect(result.openingBalance).toBe('0.0000');
      expect(result.closingBalance).toBe('0.0000');
      expect(prisma.journalLine.groupBy).not.toHaveBeenCalled();
    });
  });
});

describe('AccountsService balances', () => {
  let service: AccountsService;
  let prisma: MockPrismaClient;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new AccountsService(prisma as unknown as PrismaService);
  });

  it('getBalance comes from posted journal lines and ignores Account.openingBalance', async () => {
    prisma.account.findFirst.mockResolvedValue(ACCOUNTS[0] as never);
    prisma.journalLine.groupBy.mockResolvedValue([
      { accountId: 'cash', _sum: { debit: D('0.30'), credit: D('0.10') } },
    ] as never);

    const result = await service.getBalance(ORG_ID, 'cash');

    expect(result).toMatchObject({
      balance: '0.2000',
      totalDebits: '0.3000',
      totalCredits: '0.1000',
    });
    expect(result).not.toHaveProperty('openingBalance');
    expect(prisma.account.findFirst.mock.calls[0][0]?.where).toMatchObject({
      id: 'cash',
      organizationId: ORG_ID,
      deletedAt: null,
    });
    expect(prisma.journalLine.groupBy.mock.calls[0][0].where).toMatchObject({
      accountId: { in: ['cash'] },
      journal: { organizationId: ORG_ID, isPosted: true, deletedAt: null },
    });
  });

  it('getBalance is zero for an account with no posted lines, whatever it stores', async () => {
    prisma.account.findFirst.mockResolvedValue(ACCOUNTS[5] as never);
    prisma.journalLine.groupBy.mockResolvedValue([] as never);

    expect((await service.getBalance(ORG_ID, 'idle')).balance).toBe('0.0000');
  });

  it('getBalance rejects an account outside the organization', async () => {
    prisma.account.findFirst.mockResolvedValue(null);
    await expect(service.getBalance(ORG_ID, 'x')).rejects.toThrow(NotFoundException);
  });

  it('getBalances returns every account from a single grouped query, natural sign', async () => {
    prisma.account.findMany.mockResolvedValue(ACCOUNTS as never);
    prisma.journalLine.groupBy.mockResolvedValue([
      { accountId: 'cash', _sum: { debit: D('5'), credit: D('1.1') } },
      { accountId: 'ap', _sum: { debit: D('0'), credit: D('0.2') } },
    ] as never);

    const rows = await service.getBalances(ORG_ID);

    expect(prisma.journalLine.groupBy).toHaveBeenCalledTimes(1);
    expect(rows).toHaveLength(ACCOUNTS.length);
    expect(rows.find((r) => r.accountId === 'cash')?.balance).toBe('3.9000');
    expect(rows.find((r) => r.accountId === 'ap')?.balance).toBe('0.2000');
    expect(rows.find((r) => r.accountId === 'idle')?.balance).toBe('0.0000');
  });
});
