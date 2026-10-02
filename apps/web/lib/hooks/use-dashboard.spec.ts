import { transformDashboardOverview } from './use-dashboard';
import { moneyToNumber } from '@/lib/money';

describe('moneyToNumber', () => {
  it('parses fixed-scale decimal strings and tolerates bad input', () => {
    expect(moneyToNumber('1234.5000')).toBe(1234.5);
    expect(moneyToNumber('-20.0000')).toBe(-20);
    expect(moneyToNumber(7)).toBe(7);
    expect(moneyToNumber(undefined)).toBe(0);
    expect(moneyToNumber('not a number')).toBe(0);
    expect(moneyToNumber(null)).toBe(0);
  });
});

describe('transformDashboardOverview', () => {
  it('parses decimal strings from the API and uses the ledger cash balance', () => {
    const result = transformDashboardOverview({
      overview: {
        totalReceivables: '2463.6000',
        totalPayables: '1218.0000',
        netPosition: '1245.6000',
        monthlyRevenue: '2430.6000',
        monthlyExpenses: '0.3000',
        monthlyProfit: '2430.3000',
        yearlyRevenue: '2430.6000',
        cashBalance: '4886.5000',
      },
      bankBalances: [
        {
          id: 'b1',
          name: 'Main',
          systemBalance: '4886.5000',
          bankBalance: '2.0000',
          currency: 'EGP',
        },
      ],
      upcomingPayments: [
        {
          id: 'bill1',
          type: 'Bill',
          reference: 'BILL-1',
          vendorName: 'V',
          dueDate: '2026-10-30T00:00:00.000Z',
          amount: '812.0000',
        },
      ],
      recentActivity: {
        invoices: [
          {
            id: 'i1',
            invoiceNumber: 'INV-1',
            grandTotal: '1140.0000',
            createdAt: '2026-10-01T00:00:00.000Z',
          },
        ],
        bills: [
          {
            id: 'b1',
            billNumber: 'BILL-1',
            grandTotal: '912.0000',
            createdAt: '2026-10-02T00:00:00.000Z',
          },
        ],
      },
    });

    expect(result.stats.totalReceivables).toBe(2463.6);
    expect(result.stats.totalPayables).toBe(1218);
    expect(result.stats.revenue).toBe(2430.6);
    expect(result.stats.netProfit).toBe(2430.3);
    expect(result.stats.bankBalance).toBe(4886.5);
    expect(result.netPosition).toBe(1245.6);
    expect(result.bankAccounts[0]).toMatchObject({ systemBalance: 4886.5, bankBalance: 2 });
    expect(result.upcomingPayments[0].amount).toBe(812);
    expect(result.recentTransactions.map((t) => t.amount)).toEqual([-912, 1140]);
  });

  it('renders zeros for an empty overview (empty state)', () => {
    const result = transformDashboardOverview({});
    expect(result.stats.totalReceivables).toBe(0);
    expect(result.stats.bankBalance).toBe(0);
    expect(result.recentTransactions).toEqual([]);
    expect(result.bankAccounts).toEqual([]);
  });
});
