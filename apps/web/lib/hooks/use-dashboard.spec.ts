import { transformDashboardOverview, aggregateCashFlowByMonth } from './use-dashboard';
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

describe('aggregateCashFlowByMonth', () => {
  it('aggregates daily cash flow into monthly buckets with exact decimal arithmetic', () => {
    const dailyData = [
      { date: '2026-01-01', cashIn: '0.1', cashOut: '0.05' },
      { date: '2026-01-02', cashIn: '0.2', cashOut: '0.05' },
      { date: '2026-02-01', cashIn: '0.3', cashOut: '0.1' },
    ];

    const result = aggregateCashFlowByMonth(dailyData);

    // January should sum 0.1 + 0.2 = 0.3 exactly (not 0.30000000000000004)
    const januaryData = result.find((r) => r.month === 'Jan');
    expect(januaryData).toBeDefined();
    expect(januaryData?.inflow).toBe(0.3);
    expect(januaryData?.outflow).toBe(0.1);
    expect(januaryData?.net).toBe(0.2);

    // February
    const februaryData = result.find((r) => r.month === 'Feb');
    expect(februaryData).toBeDefined();
    expect(februaryData?.inflow).toBe(0.3);
    expect(februaryData?.outflow).toBe(0.1);
    expect(februaryData?.net).toBe(0.2);
  });

  it('handles empty and undefined cash flow values', () => {
    const dailyData = [
      { date: '2026-01-01', cashIn: '100', cashOut: undefined },
      { date: '2026-01-02', cashIn: undefined, cashOut: '50' },
    ];

    const result = aggregateCashFlowByMonth(dailyData);

    const januaryData = result.find((r) => r.month === 'Jan');
    expect(januaryData?.inflow).toBe(100);
    expect(januaryData?.outflow).toBe(50);
    expect(januaryData?.net).toBe(50);
  });

  it('keeps negative amounts and a negative net exact', () => {
    const result = aggregateCashFlowByMonth([
      { date: '2026-03-01', cashIn: '10.10', cashOut: '20.20' },
      { date: '2026-03-02', cashIn: '-0.10', cashOut: 0.3 },
    ]);
    expect(result).toEqual([{ month: 'Mar', inflow: 10, outflow: 20.5, net: -10.5 }]);
  });

  it('accumulates many daily amounts without float drift', () => {
    const daily = Array.from({ length: 30 }, (_, i) => ({
      date: `2026-04-${String(i + 1).padStart(2, '0')}`,
      cashIn: '0.1',
      cashOut: '0.0333',
    }));
    const [april] = aggregateCashFlowByMonth(daily);
    expect(april).toEqual({ month: 'Apr', inflow: 3, outflow: 0.999, net: 2.001 });
  });

  it('treats malformed amounts as zero', () => {
    const [jan] = aggregateCashFlowByMonth([
      { date: '2026-01-05', cashIn: 'abc', cashOut: '' },
      { date: '2026-01-06', cashIn: '5', cashOut: Number.NaN },
    ]);
    expect(jan).toEqual({ month: 'Jan', inflow: 5, outflow: 0, net: 5 });
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

  it('sums the bank balance fallback exactly, including overdrawn accounts', () => {
    const result = transformDashboardOverview({
      bankBalances: [
        { id: 'b1', name: 'Acc1', systemBalance: '0.1', bankBalance: '0', currency: 'USD' },
        { id: 'b2', name: 'Acc2', systemBalance: '0.2', bankBalance: '0', currency: 'USD' },
        { id: 'b3', name: 'Acc3', systemBalance: '-0.05', bankBalance: '0', currency: 'USD' },
      ],
    });
    // 0.1 + 0.2 - 0.05 is exactly 0.25 (float addition gives 0.25000000000000006)
    expect(result.stats.bankBalance).toBe(0.25);
  });
});
