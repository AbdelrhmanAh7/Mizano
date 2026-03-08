import { Test, TestingModule } from '@nestjs/testing';
import { Decimal } from '@prisma/client/runtime/library';
import { DashboardService } from './dashboard.service';
import { ReadReplicaService } from '../../../prisma/read-replica.service';
import { CacheService } from '../../../cache/cache.service';
import { createMockPrisma, MockPrismaClient } from '../../../test/mocks/prisma.mock';
import { dec } from '../../../test/helpers/decimal.helpers';

describe('DashboardService', () => {
  let service: DashboardService;
  let prisma: MockPrismaClient;

  const ORG_ID = 'org-test-001';

  beforeEach(async () => {
    prisma = createMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardService,
        { provide: ReadReplicaService, useValue: prisma },
        {
          provide: CacheService,
          useValue: {
            getOrSet: jest.fn((_key: string, fn: () => Promise<unknown>) => fn()),
          },
        },
      ],
    }).compile();

    service = module.get<DashboardService>(DashboardService);
  });

  /**
   * Helper to set up common mocks for getDashboardOverview.
   * All aggregate/count/findMany calls return sensible defaults.
   */
  function setupDashboardMocks(
    overrides: {
      receivables?: number;
      payables?: number;
      currentRevenue?: number;
      currentExpenses?: number;
      currentBillExpenses?: number;
      prevRevenue?: number;
      prevExpenses?: number;
      prevBillExpenses?: number;
      yearlyRevenue?: number;
      overdueInvoices?: number;
      overdueBills?: number;
      activeProjects?: number;
    } = {},
  ) {
    const {
      receivables = 0,
      payables = 0,
      currentRevenue = 0,
      currentExpenses = 0,
      currentBillExpenses = 0,
      prevRevenue = 0,
      prevExpenses = 0,
      prevBillExpenses = 0,
      yearlyRevenue = 0,
      overdueInvoices = 0,
      overdueBills = 0,
      activeProjects = 0,
    } = overrides;

    // invoice.aggregate is called multiple times: receivables, revenueInRange (current, prev, yearly)
    prisma.invoice.aggregate
      .mockResolvedValueOnce({ _sum: { balanceDue: new Decimal(receivables) } } as any) // receivables
      .mockResolvedValueOnce({ _sum: { grandTotal: new Decimal(currentRevenue) } } as any) // current revenue
      .mockResolvedValueOnce({ _sum: { grandTotal: new Decimal(prevRevenue) } } as any) // prev revenue
      .mockResolvedValueOnce({ _sum: { grandTotal: new Decimal(yearlyRevenue) } } as any); // yearly revenue

    // bill.aggregate: payables, current expenses from bills, prev expenses from bills
    prisma.bill.aggregate
      .mockResolvedValueOnce({ _sum: { balanceDue: new Decimal(payables) } } as any) // payables
      .mockResolvedValueOnce({ _sum: { grandTotal: new Decimal(currentBillExpenses) } } as any) // current bill expenses
      .mockResolvedValueOnce({ _sum: { grandTotal: new Decimal(prevBillExpenses) } } as any); // prev bill expenses

    // expense.aggregate: current expenses, prev expenses
    prisma.expense.aggregate
      .mockResolvedValueOnce({ _sum: { amount: new Decimal(currentExpenses) } } as any)
      .mockResolvedValueOnce({ _sum: { amount: new Decimal(prevExpenses) } } as any);

    // Bank balances
    prisma.bankAccount.findMany.mockResolvedValue([
      {
        id: 'bank-1',
        name: 'Main Account',
        systemBalance: dec('50000'),
        bankBalance: dec('50000'),
        currency: 'USD',
      },
    ] as any);

    // Counts
    prisma.invoice.count.mockResolvedValue(overdueInvoices);
    prisma.bill.count.mockResolvedValue(overdueBills);
    prisma.project.count.mockResolvedValue(activeProjects);

    // Recent activity
    prisma.invoice.findMany.mockResolvedValue([]);
    prisma.bill.findMany.mockResolvedValue([]);
  }

  describe('getDashboardOverview', () => {
    it('should return overview with revenue, expenses, and profit', async () => {
      setupDashboardMocks({
        currentRevenue: 10000,
        currentExpenses: 3000,
        currentBillExpenses: 2000,
      });

      const result = await service.getDashboardOverview(ORG_ID);

      expect(result.overview.monthlyRevenue).toBe(10000);
      // expenses = expense aggregate + bill aggregate = 3000 + 2000 = 5000
      expect(result.overview.monthlyExpenses).toBe(5000);
      // profit = revenue - expenses = 10000 - 5000 = 5000
      expect(result.overview.monthlyProfit).toBe(5000);
    });

    it('should calculate net position correctly (receivables - payables)', async () => {
      setupDashboardMocks({
        receivables: 15000,
        payables: 8000,
      });

      const result = await service.getDashboardOverview(ORG_ID);

      expect(result.overview.totalReceivables).toBe(15000);
      expect(result.overview.totalPayables).toBe(8000);
      expect(result.overview.netPosition).toBe(7000); // 15000 - 8000
    });

    it('should compute trend percentages correctly', async () => {
      setupDashboardMocks({
        currentRevenue: 12000,
        prevRevenue: 10000,
        currentExpenses: 4000,
        currentBillExpenses: 1000,
        prevExpenses: 3000,
        prevBillExpenses: 2000,
      });

      const result = await service.getDashboardOverview(ORG_ID);

      // Revenue trend: ((12000 - 10000) / |10000|) * 100 = 20%
      expect(result.trends.revenue.value).toBe(20);
      expect(result.trends.revenue.isPositive).toBe(true);

      // Expenses: current = 4000 + 1000 = 5000, prev = 3000 + 2000 = 5000
      // Trend = 0%
      expect(result.trends.expenses.value).toBe(0);
      expect(result.trends.expenses.isPositive).toBe(true);
    });

    it('should handle zero previous period (100% increase)', async () => {
      setupDashboardMocks({
        currentRevenue: 5000,
        prevRevenue: 0,
      });

      const result = await service.getDashboardOverview(ORG_ID);

      // When previous is 0 and current > 0, trend is 100%
      expect(result.trends.revenue.value).toBe(100);
      expect(result.trends.revenue.isPositive).toBe(true);
    });

    it('should handle both zero current and previous (0% change)', async () => {
      setupDashboardMocks({
        currentRevenue: 0,
        prevRevenue: 0,
      });

      const result = await service.getDashboardOverview(ORG_ID);

      expect(result.trends.revenue.value).toBe(0);
    });

    it('should report alerts for overdue items', async () => {
      setupDashboardMocks({
        overdueInvoices: 5,
        overdueBills: 3,
        activeProjects: 2,
      });

      const result = await service.getDashboardOverview(ORG_ID);

      expect(result.alerts.overdueInvoices).toBe(5);
      expect(result.alerts.overdueBills).toBe(3);
      expect(result.alerts.activeProjects).toBe(2);
    });

    it('should return bank balances parsed from Decimal', async () => {
      setupDashboardMocks();

      const result = await service.getDashboardOverview(ORG_ID);

      expect(result.bankBalances).toHaveLength(1);
      expect(result.bankBalances[0].systemBalance).toBe(50000);
      expect(typeof result.bankBalances[0].systemBalance).toBe('number');
    });

    it('should accept custom date range parameters', async () => {
      setupDashboardMocks({ currentRevenue: 25000 });

      const result = await service.getDashboardOverview(ORG_ID, '2024-01-01', '2024-03-31');

      expect(result).toBeDefined();
      expect(result.overview.monthlyRevenue).toBe(25000);
    });
  });

  describe('computeTrend (private, tested via getDashboardOverview)', () => {
    it('should compute negative trend when revenue decreases', async () => {
      setupDashboardMocks({
        currentRevenue: 8000,
        prevRevenue: 10000,
        currentExpenses: 0,
        currentBillExpenses: 0,
        prevExpenses: 0,
        prevBillExpenses: 0,
      });

      const result = await service.getDashboardOverview(ORG_ID);

      // Revenue trend: ((8000 - 10000) / 10000) * 100 = -20%
      expect(result.trends.revenue.value).toBe(20); // abs value
      expect(result.trends.revenue.isPositive).toBe(false);
    });
  });

  describe('getExpensesByCategory', () => {
    it('should aggregate expenses by account category', async () => {
      prisma.expense.findMany.mockResolvedValue([
        { amount: dec('500'), account: { id: 'a1', name: 'Office Supplies' } },
        { amount: dec('300'), account: { id: 'a1', name: 'Office Supplies' } },
        { amount: dec('1000'), account: { id: 'a2', name: 'Travel' } },
      ] as any);

      const result = await service.getExpensesByCategory(ORG_ID, '2024-01-01', '2024-12-31');

      expect(result).toHaveLength(2);
      // Should be sorted by amount descending
      expect(result[0].category).toBe('Travel');
      expect(result[0].amount).toBe(1000);
      expect(result[1].category).toBe('Office Supplies');
      expect(result[1].amount).toBe(800); // 500 + 300
    });

    it('should use "Uncategorized" for expenses without account', async () => {
      prisma.expense.findMany.mockResolvedValue([{ amount: dec('200'), account: null }] as any);

      const result = await service.getExpensesByCategory(ORG_ID, '2024-01-01', '2024-12-31');

      expect(result).toHaveLength(1);
      expect(result[0].category).toBe('Uncategorized');
      expect(result[0].amount).toBe(200);
    });

    it('should return empty array when no expenses exist', async () => {
      prisma.expense.findMany.mockResolvedValue([]);

      const result = await service.getExpensesByCategory(ORG_ID, '2024-01-01', '2024-12-31');
      expect(result).toEqual([]);
    });
  });

  describe('getTopCustomers', () => {
    it('should return customers sorted by total revenue', async () => {
      prisma.customer.findMany.mockResolvedValue([
        {
          id: 'c1',
          name: 'Small Customer',
          invoices: [{ grandTotal: dec('500') }],
        },
        {
          id: 'c2',
          name: 'Big Customer',
          invoices: [{ grandTotal: dec('5000') }, { grandTotal: dec('3000') }],
        },
        {
          id: 'c3',
          name: 'Medium Customer',
          invoices: [{ grandTotal: dec('2000') }],
        },
      ] as any);

      const result = await service.getTopCustomers(ORG_ID, 5);

      expect(result).toHaveLength(3);
      expect(result[0].name).toBe('Big Customer');
      expect(result[0].totalRevenue).toBe(8000); // 5000 + 3000
      expect(result[0].invoiceCount).toBe(2);
      expect(result[1].name).toBe('Medium Customer');
      expect(result[1].totalRevenue).toBe(2000);
      expect(result[2].name).toBe('Small Customer');
      expect(result[2].totalRevenue).toBe(500);
    });

    it('should limit results to specified count', async () => {
      prisma.customer.findMany.mockResolvedValue([
        { id: 'c1', name: 'A', invoices: [{ grandTotal: dec('100') }] },
        { id: 'c2', name: 'B', invoices: [{ grandTotal: dec('200') }] },
        { id: 'c3', name: 'C', invoices: [{ grandTotal: dec('300') }] },
      ] as any);

      const result = await service.getTopCustomers(ORG_ID, 2);

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('C');
      expect(result[1].name).toBe('B');
    });

    it('should handle customers with no invoices', async () => {
      prisma.customer.findMany.mockResolvedValue([
        { id: 'c1', name: 'No Sales', invoices: [] },
      ] as any);

      const result = await service.getTopCustomers(ORG_ID, 5);

      expect(result).toHaveLength(1);
      expect(result[0].totalRevenue).toBe(0);
      expect(result[0].invoiceCount).toBe(0);
    });
  });

  describe('getProjectsOverview', () => {
    it('should calculate hours logged and revenue per project', async () => {
      prisma.project.findMany.mockResolvedValue([
        {
          id: 'p1',
          name: 'Website Redesign',
          status: 'IN_PROGRESS',
          budget: dec('10000'),
          timesheetEntries: [
            { hours: dec('20'), duration: dec('20') },
            { hours: dec('15'), duration: dec('15') },
          ],
          invoices: [{ total: dec('5000'), grandTotal: dec('5000') }],
        },
      ] as any);

      const result = await service.getProjectsOverview(ORG_ID);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Website Redesign');
      expect(result[0].hoursLogged).toBe(35); // 20 + 15
      expect(result[0].revenue).toBe(5000);
      expect(result[0].budget).toBe(10000);
      expect(result[0].budgetUsedPercent).toBe(50); // (5000 / 10000) * 100
    });

    it('should handle zero budget gracefully', async () => {
      prisma.project.findMany.mockResolvedValue([
        {
          id: 'p1',
          name: 'Pro Bono',
          status: 'IN_PROGRESS',
          budget: null,
          timesheetEntries: [],
          invoices: [],
        },
      ] as any);

      const result = await service.getProjectsOverview(ORG_ID);

      expect(result[0].budget).toBe(0);
      expect(result[0].budgetUsedPercent).toBe(0);
    });
  });

  describe('getCashFlowChart', () => {
    it('should return daily cash flow data with net calculation', async () => {
      const today = new Date();
      const todayStr = today.toISOString().split('T')[0];

      prisma.paymentReceived.findMany.mockResolvedValue([
        { date: today, amount: dec('5000') },
      ] as any);
      prisma.paymentMade.findMany.mockResolvedValue([{ date: today, amount: dec('2000') }] as any);
      prisma.expense.findMany.mockResolvedValue([{ date: today, amount: dec('1000') }] as any);

      const result = await service.getCashFlowChart(ORG_ID, 30);

      expect(result).toHaveLength(30);

      // Find today's entry
      const todayEntry = result.find((d) => d.date === todayStr);
      expect(todayEntry).toBeDefined();
      expect(todayEntry!.cashIn).toBe(5000);
      expect(todayEntry!.cashOut).toBe(3000); // 2000 + 1000
      expect(todayEntry!.net).toBe(2000); // 5000 - 3000
    });

    it('should return zeros for days with no transactions', async () => {
      prisma.paymentReceived.findMany.mockResolvedValue([]);
      prisma.paymentMade.findMany.mockResolvedValue([]);
      prisma.expense.findMany.mockResolvedValue([]);

      const result = await service.getCashFlowChart(ORG_ID, 7);

      expect(result).toHaveLength(7);
      result.forEach((day) => {
        expect(day.cashIn).toBe(0);
        expect(day.cashOut).toBe(0);
        expect(day.net).toBe(0);
      });
    });
  });

  describe('getRevenueChart', () => {
    it('should return monthly revenue and expense data', async () => {
      // Mock groupBy calls
      prisma.invoice.groupBy.mockResolvedValue([]);
      prisma.expense.groupBy.mockResolvedValue([]);
      prisma.bill.groupBy.mockResolvedValue([]);

      const result = await service.getRevenueChart(ORG_ID, 12);

      expect(result).toHaveLength(12);
      result.forEach((month) => {
        expect(month).toHaveProperty('month');
        expect(month).toHaveProperty('revenue');
        expect(month).toHaveProperty('expenses');
        expect(month).toHaveProperty('profit');
        expect(month.profit).toBe(month.revenue - month.expenses);
      });
    });

    it('should calculate profit as revenue minus expenses for each month', async () => {
      const today = new Date();
      const currentMonth = new Date(today.getFullYear(), today.getMonth(), 1);

      prisma.invoice.groupBy.mockResolvedValue([
        { date: currentMonth, _sum: { grandTotal: dec('10000') } },
      ] as any);
      prisma.expense.groupBy.mockResolvedValue([
        { date: currentMonth, _sum: { amount: dec('3000') } },
      ] as any);
      prisma.bill.groupBy.mockResolvedValue([
        { date: currentMonth, _sum: { grandTotal: dec('2000') } },
      ] as any);

      const result = await service.getRevenueChart(ORG_ID, 12);

      // The current month should have the data
      const currentMonthEntry = result[result.length - 1];
      expect(currentMonthEntry.revenue).toBe(10000);
      expect(currentMonthEntry.expenses).toBe(5000); // 3000 + 2000
      expect(currentMonthEntry.profit).toBe(5000); // 10000 - 5000
    });
  });
});
