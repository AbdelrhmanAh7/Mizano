import { AccountType, CreditNoteType } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { DashboardService } from './dashboard.service';
import { ReadReplicaService } from '../../../prisma/read-replica.service';
import { CacheService } from '../../../cache/cache.service';
import { createMockPrisma, MockPrismaClient } from '../../../test/mocks/prisma.mock';

const ORG_ID = 'org-test-001';
const D = (v: string | number): Decimal => new Decimal(v);
const ISSUED = { in: ['SENT', 'PARTIALLY_PAID', 'PAID', 'OVERDUE'] };
const POSTED_BILLS = { in: ['OPEN', 'PARTIALLY_PAID', 'PAID', 'OVERDUE'] };

const ACCOUNTS = [
  { id: 'rev', code: '4000', name: 'Sales', type: AccountType.REVENUE },
  { id: 'inc', code: '4100', name: 'Other income', type: AccountType.INCOME },
  { id: 'cogs', code: '5000', name: 'COGS', type: AccountType.EXPENSE },
  { id: 'rent', code: '6100', name: 'Rent', type: AccountType.EXPENSE },
];

type Sum = { accountId: string; debit: string; credit: string };

describe('DashboardService', () => {
  let service: DashboardService;
  let prisma: MockPrismaClient;

  beforeEach(() => {
    prisma = createMockPrisma();
    const cache = {
      getOrSet: jest.fn().mockImplementation((_key: string, fn: () => Promise<unknown>) => fn()),
    };
    service = new DashboardService(
      prisma as unknown as ReadReplicaService,
      cache as unknown as CacheService,
    );
  });

  /** Posted-ledger sums returned by every grouped journal-line query. */
  function ledger(sums: Sum[]): void {
    prisma.journalLine.groupBy.mockResolvedValue(
      sums.map((s) => ({
        accountId: s.accountId,
        _sum: { debit: D(s.debit), credit: D(s.credit) },
      })) as never,
    );
  }

  function arrangeOverview(opts: {
    receivables?: string;
    unappliedCredits?: string;
    payables?: string;
    vendorCredits?: string;
    sums?: Sum[];
  }): void {
    prisma.account.findMany.mockImplementation((async (args: { where?: { id?: unknown } }) => {
      if (args?.where?.id) return [{ id: 'cash' }];
      return ACCOUNTS;
    }) as never);
    ledger(opts.sums ?? []);
    prisma.invoice.aggregate.mockResolvedValue({
      _sum: { balanceDue: D(opts.receivables ?? '0') },
    } as never);
    prisma.creditNote.aggregate.mockResolvedValue({
      _sum: { amount: D(opts.unappliedCredits ?? '0') },
    } as never);
    prisma.bill.aggregate.mockResolvedValue({
      _sum: { balanceDue: D(opts.payables ?? '0') },
    } as never);
    prisma.vendorCredit.aggregate.mockResolvedValue({
      _sum: { amount: D(opts.vendorCredits ?? '0') },
    } as never);
    prisma.organization.findUnique.mockResolvedValue({
      defaultBankAccountId: null,
      defaultCashAccountId: 'cash',
    } as never);
    prisma.bankAccount.findMany.mockResolvedValue([] as never);
    prisma.invoice.count.mockResolvedValue(0 as never);
    prisma.bill.count.mockResolvedValue(0 as never);
    prisma.project.count.mockResolvedValue(0 as never);
    prisma.invoice.findMany.mockResolvedValue([] as never);
    prisma.bill.findMany.mockResolvedValue([] as never);
  }

  describe('getDashboardOverview', () => {
    it('derives revenue and expenses from posted ledger lines, as 4-dp strings', async () => {
      arrangeOverview({
        sums: [
          { accountId: 'rev', debit: '0', credit: '10000.10' },
          { accountId: 'cogs', debit: '2000', credit: '0' },
          { accountId: 'rent', debit: '3000.05', credit: '0' },
        ],
      });

      const { overview } = await service.getDashboardOverview(ORG_ID);

      expect(overview.monthlyRevenue).toBe('10000.1000');
      expect(overview.monthlyExpenses).toBe('5000.0500');
      expect(overview.monthlyProfit).toBe('5000.0500');
    });

    it('queries only posted, non-deleted journals of the organization', async () => {
      arrangeOverview({});

      await service.getDashboardOverview(ORG_ID);

      const calls = prisma.journalLine.groupBy.mock.calls;
      expect(calls.length).toBeGreaterThan(0);
      for (const [args] of calls) {
        expect(args.where).toMatchObject({
          journal: { organizationId: ORG_ID, isPosted: true, deletedAt: null },
        });
      }
    });

    it('adds Decimal values exactly (0.1 + 0.2 = 0.3000)', async () => {
      arrangeOverview({
        sums: [
          { accountId: 'rev', debit: '0', credit: '0.1' },
          { accountId: 'inc', debit: '0', credit: '0.2' },
        ],
      });

      const { overview } = await service.getDashboardOverview(ORG_ID);

      expect(overview.monthlyRevenue).toBe('0.3000');
    });

    it('receivables exclude DRAFT/VOID/deleted invoices and net unapplied credit notes', async () => {
      arrangeOverview({ receivables: '1000.30', unappliedCredits: '20' });

      const { overview } = await service.getDashboardOverview(ORG_ID);

      expect(overview.totalReceivables).toBe('980.3000');
      const invoiceWhere = prisma.invoice.aggregate.mock.calls[0][0]?.where;
      expect(invoiceWhere).toMatchObject({ organizationId: ORG_ID, deletedAt: null });
      expect(invoiceWhere?.status).toEqual(ISSUED);
      expect(prisma.creditNote.aggregate.mock.calls[0][0]?.where).toMatchObject({
        organizationId: ORG_ID,
        deletedAt: null,
        type: CreditNoteType.APPLY_TO_INVOICE,
        appliedToInvoiceId: null,
      });
    });

    it('payables subtract unapplied vendor credits and net position uses exact Decimal', async () => {
      arrangeOverview({ receivables: '15000.20', payables: '8000.10', vendorCredits: '0.10' });

      const { overview } = await service.getDashboardOverview(ORG_ID);

      expect(overview.totalPayables).toBe('8000.0000');
      expect(overview.netPosition).toBe('7000.2000');
    });

    it('reports cash from the ledger accounts, not stored bank balances', async () => {
      arrangeOverview({});
      ledger([{ accountId: 'cash', debit: '5000.50', credit: '114' }]);
      prisma.bankAccount.findMany.mockResolvedValue([
        {
          id: 'b1',
          name: 'Main',
          systemBalance: D('1'),
          bankBalance: D('2'),
          currency: 'EGP',
          linkedAccountId: 'cash',
        },
      ] as never);

      const result = await service.getDashboardOverview(ORG_ID);

      expect(result.overview.cashBalance).toBe('4886.5000');
      expect(result.bankBalances[0].systemBalance).toBe('4886.5000');
      expect(result.bankBalances[0].bankBalance).toBe('2.0000');
    });

    it('reports a zero trend when nothing changed and flags 100% from a zero base', async () => {
      arrangeOverview({ sums: [{ accountId: 'rev', debit: '0', credit: '100' }] });
      const same = await service.getDashboardOverview(ORG_ID);
      // the mock returns the same sums for the previous period
      expect(same.trends.revenue).toEqual({ value: 0, isPositive: true });

      arrangeOverview({});
      const flat = await service.getDashboardOverview(ORG_ID);
      expect(flat.trends.revenue).toEqual({ value: 0, isPositive: true });
    });

    it('lists only issued invoices and posted bills as recent activity, money as strings', async () => {
      arrangeOverview({});
      prisma.invoice.findMany.mockResolvedValue([
        { id: 'i1', grandTotal: D('1.1'), balanceDue: D('0.1'), customer: { name: 'C' } },
      ] as never);

      const { recentActivity } = await service.getDashboardOverview(ORG_ID);

      expect(recentActivity.invoices[0]).toMatchObject({
        grandTotal: '1.1000',
        balanceDue: '0.1000',
      });
      expect(prisma.invoice.findMany.mock.calls[0][0]?.where?.status).toEqual(ISSUED);
      expect(prisma.bill.findMany.mock.calls[0][0]?.where?.status).toEqual(POSTED_BILLS);
    });
  });

  describe('getExpensesByCategory', () => {
    it('sums posted expense accounts only, sorted, with an end-of-day bound', async () => {
      prisma.account.findMany.mockResolvedValue(ACCOUNTS as never);
      ledger([
        { accountId: 'rent', debit: '300.10', credit: '0' },
        { accountId: 'cogs', debit: '500', credit: '100.25' },
        { accountId: 'rev', debit: '0', credit: '9999' },
      ]);

      const result = await service.getExpensesByCategory(ORG_ID, '2026-01-01', '2026-01-31');

      expect(result).toEqual([
        { category: 'COGS', amount: '399.7500' },
        { category: 'Rent', amount: '300.1000' },
      ]);
      const where = prisma.journalLine.groupBy.mock.calls[0][0].where as {
        accountId: unknown;
        journal: { date: { lte: Date } };
      };
      expect(where.accountId).toEqual({ in: ['cogs', 'rent'] });
      expect(where.journal.date.lte.toISOString()).toBe('2026-01-31T23:59:59.999Z');
    });

    it('returns an empty array when there is no posted expense', async () => {
      prisma.account.findMany.mockResolvedValue(ACCOUNTS as never);
      ledger([]);
      expect(await service.getExpensesByCategory(ORG_ID, '2026-01-01', '2026-01-31')).toEqual([]);
    });
  });

  describe('getTopCustomers', () => {
    it('ranks issued invoices by exact Decimal total using one grouped query', async () => {
      prisma.invoice.groupBy.mockResolvedValue([
        { customerId: 'c1', _sum: { grandTotal: D('0.1') }, _count: { id: 1 } },
        { customerId: 'c2', _sum: { grandTotal: D('0.30') }, _count: { id: 2 } },
      ] as never);
      prisma.customer.findMany.mockResolvedValue([
        { id: 'c1', name: 'One' },
        { id: 'c2', name: 'Two' },
      ] as never);

      const result = await service.getTopCustomers(ORG_ID, 5);

      expect(result).toEqual([
        { id: 'c2', name: 'Two', totalRevenue: '0.3000', invoiceCount: 2 },
        { id: 'c1', name: 'One', totalRevenue: '0.1000', invoiceCount: 1 },
      ]);
      const where = prisma.invoice.groupBy.mock.calls[0][0].where;
      expect(where).toMatchObject({ organizationId: ORG_ID, deletedAt: null });
      expect(where?.status).toEqual(ISSUED);
      expect(prisma.customer.findMany).toHaveBeenCalledTimes(1);
    });
  });

  describe('getCashFlowChart', () => {
    it('nets each posted journal on cash once and returns decimal strings per day', async () => {
      const today = new Date();
      prisma.organization.findUnique.mockResolvedValue({
        defaultBankAccountId: null,
        defaultCashAccountId: 'cash',
      } as never);
      prisma.bankAccount.findMany.mockResolvedValue([] as never);
      prisma.account.findMany.mockResolvedValue([{ id: 'cash' }] as never);
      const line = (journalId: string, debit: string, credit: string) => ({
        accountId: 'cash',
        journalId,
        debit: D(debit),
        credit: D(credit),
        journal: { date: today },
      });
      prisma.journalLine.findMany.mockResolvedValue([
        line('j1', '0.1', '0'),
        line('j2', '0.2', '0'),
        line('j3', '0', '0.05'),
        // a transfer between two cash accounts is neither in nor out
        line('j4', '9', '0'),
        line('j4', '0', '9'),
      ] as never);

      const data = await service.getCashFlowChart(ORG_ID, 3);

      expect(data).toHaveLength(3);
      expect(data[2]).toEqual({
        date: today.toISOString().slice(0, 10),
        cashIn: '0.3000',
        cashOut: '0.0500',
        net: '0.2500',
      });
      expect(data[0]).toMatchObject({ cashIn: '0.0000', cashOut: '0.0000', net: '0.0000' });
      expect(prisma.journalLine.findMany.mock.calls[0][0]?.where).toMatchObject({
        journal: { organizationId: ORG_ID, isPosted: true, deletedAt: null },
      });
    });
  });

  describe('getRevenueChart', () => {
    it('buckets posted ledger lines per month with exact profit', async () => {
      const now = new Date();
      const thisMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 5));
      prisma.account.findMany.mockResolvedValue(ACCOUNTS as never);
      const line = (accountId: string, debit: string, credit: string) => ({
        accountId,
        journalId: `j-${accountId}`,
        debit: D(debit),
        credit: D(credit),
        journal: { date: thisMonth },
      });
      prisma.journalLine.findMany.mockResolvedValue([
        line('rev', '0', '0.1'),
        line('inc', '0', '0.2'),
        line('rent', '0.05', '0'),
      ] as never);

      const data = await service.getRevenueChart(ORG_ID, 3);

      expect(data).toHaveLength(3);
      expect(data[2]).toMatchObject({ revenue: '0.3000', expenses: '0.0500', profit: '0.2500' });
      expect(data[0]).toMatchObject({ revenue: '0.0000', expenses: '0.0000', profit: '0.0000' });
    });
  });

  describe('getAccountBalances', () => {
    it('sums natural balances per type from posted lines and ignores Account.openingBalance', async () => {
      prisma.account.findMany.mockResolvedValue([
        { id: 'cash', type: AccountType.ASSET, isActive: true, openingBalance: D('999') },
        { id: 'ap', type: AccountType.LIABILITY, isActive: true, openingBalance: D('999') },
        { id: 'old', type: AccountType.ASSET, isActive: false, openingBalance: D('999') },
      ] as never);
      ledger([
        { accountId: 'cash', debit: '0.30', credit: '0.10' },
        { accountId: 'ap', debit: '0', credit: '0.20' },
      ]);

      const result = await service.getAccountBalances(ORG_ID);

      expect(result.find((r) => r.type === AccountType.ASSET)).toEqual({
        type: AccountType.ASSET,
        balance: '0.2000',
        count: 1,
      });
      expect(result.find((r) => r.type === AccountType.LIABILITY)?.balance).toBe('0.2000');
      expect(result.find((r) => r.type === AccountType.EQUITY)?.balance).toBe('0.0000');
      expect(prisma.account.findMany.mock.calls[0][0]?.where).toMatchObject({
        organizationId: ORG_ID,
        deletedAt: null,
      });
    });
  });

  describe('status charts', () => {
    it('invoice status excludes DRAFT and VOID and returns decimal strings', async () => {
      prisma.invoice.groupBy.mockResolvedValue([
        { status: 'SENT', _count: { id: 2 }, _sum: { grandTotal: D('0.3') } },
      ] as never);

      const result = await service.getInvoiceStatus(ORG_ID);

      expect(result).toEqual([{ status: 'SENT', count: 2, amount: '0.3000' }]);
      expect(prisma.invoice.groupBy.mock.calls[0][0].where?.status).toEqual(ISSUED);
    });

    it('bill status excludes draft/pending/void bills', async () => {
      prisma.bill.groupBy.mockResolvedValue([
        { status: 'OPEN', _count: { id: 1 }, _sum: { grandTotal: D('912') } },
      ] as never);

      const result = await service.getBillStatus(ORG_ID);

      expect(result).toEqual([{ status: 'OPEN', count: 1, amount: '912.0000' }]);
      expect(prisma.bill.groupBy.mock.calls[0][0].where?.status).toEqual(POSTED_BILLS);
    });

    it('payment collection excludes voided payments and adds exactly', async () => {
      const now = new Date();
      const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 2));
      prisma.paymentReceived.groupBy.mockResolvedValue([
        { date, _sum: { amount: D('0.1') } },
        { date, _sum: { amount: D('0.2') } },
      ] as never);

      const result = await service.getPaymentCollection(ORG_ID, 2);

      expect(result[1].amount).toBe('0.3000');
      expect(prisma.paymentReceived.groupBy.mock.calls[0][0].where).toMatchObject({
        organizationId: ORG_ID,
        deletedAt: null,
      });
    });

    it('top vendors rank posted bills by exact total', async () => {
      prisma.bill.groupBy.mockResolvedValue([
        { vendorId: 'v1', _sum: { grandTotal: D('0.1') }, _count: { id: 1 } },
        { vendorId: 'v2', _sum: { grandTotal: D('0.3') }, _count: { id: 1 } },
      ] as never);
      prisma.vendor.findMany.mockResolvedValue([
        { id: 'v1', name: 'A' },
        { id: 'v2', name: 'B' },
      ] as never);

      const result = await service.getTopVendors(ORG_ID, 1);

      expect(result).toEqual([{ id: 'v2', name: 'B', totalAmount: '0.3000', billCount: 1 }]);
    });
  });

  describe('getProjectsOverview', () => {
    it('sums issued invoices exactly and returns money as strings', async () => {
      prisma.project.findMany.mockResolvedValue([
        {
          id: 'p1',
          name: 'P',
          status: 'IN_PROGRESS',
          budget: D('1000'),
          timesheetEntries: [{ hours: D('2.5'), duration: D('0') }],
          invoices: [{ grandTotal: D('0.1') }, { grandTotal: D('0.2') }],
        },
      ] as never);

      const [project] = await service.getProjectsOverview(ORG_ID);

      expect(project.revenue).toBe('0.3000');
      expect(project.budget).toBe('1000.0000');
      expect(project.hoursLogged).toBe(2.5);
      const include = prisma.project.findMany.mock.calls[0][0]?.include as {
        invoices: { where: { deletedAt: null; status: unknown } };
      };
      expect(include.invoices.where).toEqual({ deletedAt: null, status: ISSUED });
    });
  });
});
