'use client';

import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { api } from '@/lib/api';
import { moneyToNumber } from '@/lib/money';

// Types
export interface DashboardStats {
  revenue: number;
  expenses: number;
  netProfit: number;
  bankBalance: number;
  totalReceivables: number;
  totalPayables: number;
  overdueInvoices: number;
  overdueBills: number;
  activeProjects: number;
}

export interface Trend {
  value: number;
  isPositive: boolean;
}

export interface DashboardTrends {
  revenue: Trend;
  expenses: Trend;
  profit: Trend;
}

export interface ReceivablesPayables {
  receivables: number;
  payables: number;
}

export interface CashFlowPoint {
  month: string;
  inflow: number;
  outflow: number;
  net: number;
}

export interface ExpenseCategory {
  name: string;
  amount: number;
  percentage: number;
}

export interface RevenuePoint {
  month: string;
  revenue: number;
  expenses?: number;
  profit?: number;
}

export interface TopCustomer {
  id: string;
  name: string;
  totalRevenue: number;
  invoiceCount: number;
}

export interface BankBalancePoint {
  month: string;
  balance: number;
}

export interface InventoryValuePoint {
  month: string;
  value: number;
  itemCount: number;
}

export interface AIAlert {
  id: string;
  type: 'LOW_STOCK' | 'OVERDUE_INVOICE' | 'OVERDUE_BILL' | 'BUDGET_THRESHOLD' | 'ANOMALY';
  severity: 'info' | 'warning' | 'error';
  message: string;
  link?: string;
  createdAt: string;
}

export interface RecentTransaction {
  id: string;
  type: 'INVOICE' | 'PAYMENT_RECEIVED' | 'BILL' | 'PAYMENT_MADE' | 'EXPENSE';
  reference: string;
  description: string;
  amount: number;
  date: string;
  link: string;
}

export interface UpcomingPayment {
  id: string;
  reference: string;
  vendorName: string;
  dueDate: string;
  amount: number;
  link: string;
}

export interface BankAccountSummary {
  id: string;
  name: string;
  systemBalance: number;
  bankBalance: number;
  currency: string;
}

export interface ProjectOverview {
  id: string;
  name: string;
  status: string;
  hoursLogged: number;
  revenue: number;
  budget: number;
  budgetUsedPercent: number;
}

const REFETCH_INTERVAL = 60000;

export interface DashboardStatsResult {
  stats: DashboardStats;
  trends: DashboardTrends;
  receivablesVsPayables: ReceivablesPayables;
  alerts: AIAlert[];
  recentTransactions: RecentTransaction[];
  upcomingPayments: UpcomingPayment[];
  bankAccounts: BankAccountSummary[];
  yearlyRevenue: number;
  netPosition: number;
}

/**
 * Transform raw dashboard API response into the typed result.
 * Shared between client-side hook and server-side prefetch.
 */
interface DashboardOverviewResponse {
  bankBalances?: Array<{
    id?: string;
    name?: string;
    systemBalance?: string | number;
    bankBalance?: string | number;
    currency?: string;
  }>;
  alerts?: { overdueInvoices?: number; overdueBills?: number; activeProjects?: number };
  recentActivity?: {
    invoices?: Array<{
      id: string;
      invoiceNumber: string;
      customer?: { name: string };
      grandTotal?: string;
      total?: string;
      createdAt: string;
    }>;
    bills?: Array<{
      id: string;
      billNumber: string;
      vendor?: { name: string };
      grandTotal?: string;
      total?: string;
      createdAt: string;
    }>;
  };
  overview?: {
    monthlyRevenue?: string | number;
    monthlyExpenses?: string | number;
    monthlyProfit?: string | number;
    totalReceivables?: string | number;
    totalPayables?: string | number;
    yearlyRevenue?: string | number;
    netPosition?: string | number;
    /** Posted-ledger total of every cash and bank account. */
    cashBalance?: string | number;
  };
  trends?: { revenue?: Trend; expenses?: Trend; profit?: Trend };
  upcomingPayments?: Array<{
    id: string;
    type: string;
    reference: string;
    vendorName: string;
    dueDate: string;
    amount: string | number;
  }>;
}

export function transformDashboardOverview(
  overview: DashboardOverviewResponse,
): DashboardStatsResult {
  const now = new Date();

  // Cash KPI is the posted-ledger total of all cash and bank accounts (falls back to the sum of
  // the listed bank accounts for older responses).
  const bankBalanceTotal =
    overview.overview?.cashBalance !== undefined
      ? moneyToNumber(overview.overview.cashBalance)
      : Array.isArray(overview.bankBalances)
        ? overview.bankBalances.reduce((sum, b) => sum + moneyToNumber(b.systemBalance), 0)
        : 0;

  // Build alerts from overview
  const alerts: AIAlert[] = [];
  if ((overview.alerts?.overdueInvoices ?? 0) > 0) {
    alerts.push({
      id: 'overdue-invoices',
      type: 'OVERDUE_INVOICE',
      severity: 'error',
      message: `${overview.alerts?.overdueInvoices} overdue invoice(s) need attention`,
      link: '/sales/invoices?status=OVERDUE',
      createdAt: now.toISOString(),
    });
  }
  if ((overview.alerts?.overdueBills ?? 0) > 0) {
    alerts.push({
      id: 'overdue-bills',
      type: 'OVERDUE_BILL',
      severity: 'warning',
      message: `${overview.alerts?.overdueBills} overdue bill(s) need attention`,
      link: '/purchases/bills?status=OVERDUE',
      createdAt: now.toISOString(),
    });
  }

  // Map individual bank accounts
  const bankAccounts: BankAccountSummary[] = Array.isArray(overview.bankBalances)
    ? overview.bankBalances.map((b) => ({
        id: b.id || '',
        name: b.name || 'Unknown',
        systemBalance: moneyToNumber(b.systemBalance),
        bankBalance: moneyToNumber(b.bankBalance),
        currency: b.currency || 'USD',
      }))
    : [];

  // Map upcoming payments
  const upcomingPayments: UpcomingPayment[] = Array.isArray(overview.upcomingPayments)
    ? overview.upcomingPayments.map((p) => ({
        id: p.id,
        reference: p.reference,
        vendorName: p.vendorName,
        dueDate: typeof p.dueDate === 'string' ? p.dueDate : new Date(p.dueDate).toISOString(),
        amount: moneyToNumber(p.amount),
        link: `/purchases/bills/${p.id}`,
      }))
    : [];

  // Map recent activity
  const recentTransactions: RecentTransaction[] = [];
  if (Array.isArray(overview.recentActivity?.invoices)) {
    for (const inv of overview.recentActivity.invoices) {
      recentTransactions.push({
        id: inv.id,
        type: 'INVOICE',
        reference: inv.invoiceNumber,
        description: `Invoice to ${inv.customer?.name || 'Unknown'}`,
        amount: moneyToNumber(inv.grandTotal ?? inv.total),
        date: inv.createdAt,
        link: `/sales/invoices/${inv.id}`,
      });
    }
  }
  if (Array.isArray(overview.recentActivity?.bills)) {
    for (const bill of overview.recentActivity.bills) {
      recentTransactions.push({
        id: bill.id,
        type: 'BILL',
        reference: bill.billNumber,
        description: `Bill from ${bill.vendor?.name || 'Unknown'}`,
        amount: -moneyToNumber(bill.grandTotal ?? bill.total),
        date: bill.createdAt,
        link: `/purchases/bills/${bill.id}`,
      });
    }
  }
  recentTransactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return {
    stats: {
      revenue: moneyToNumber(overview.overview?.monthlyRevenue),
      expenses: moneyToNumber(overview.overview?.monthlyExpenses),
      netProfit: moneyToNumber(overview.overview?.monthlyProfit),
      bankBalance: bankBalanceTotal,
      totalReceivables: moneyToNumber(overview.overview?.totalReceivables),
      totalPayables: moneyToNumber(overview.overview?.totalPayables),
      overdueInvoices: overview.alerts?.overdueInvoices || 0,
      overdueBills: overview.alerts?.overdueBills || 0,
      activeProjects: overview.alerts?.activeProjects || 0,
    },
    trends: {
      revenue: overview.trends?.revenue || { value: 0, isPositive: true },
      expenses: overview.trends?.expenses || { value: 0, isPositive: true },
      profit: overview.trends?.profit || { value: 0, isPositive: true },
    },
    receivablesVsPayables: {
      receivables: moneyToNumber(overview.overview?.totalReceivables),
      payables: moneyToNumber(overview.overview?.totalPayables),
    },
    alerts,
    recentTransactions,
    upcomingPayments,
    bankAccounts,
    yearlyRevenue: moneyToNumber(overview.overview?.yearlyRevenue),
    netPosition: moneyToNumber(overview.overview?.netPosition),
  };
}

/**
 * KPI stats — fastest endpoint, renders first
 */
export function useDashboardStats(dateRange?: { from: Date; to: Date }) {
  // Date-only values are the user's local calendar days, not the UTC day.
  const startDate = dateRange?.from ? format(dateRange.from, 'yyyy-MM-dd') : undefined;
  const endDate = dateRange?.to ? format(dateRange.to, 'yyyy-MM-dd') : undefined;

  return useQuery({
    queryKey: ['dashboard', 'stats', startDate, endDate],
    queryFn: async (): Promise<DashboardStatsResult> => {
      const params = new URLSearchParams();
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);
      const qs = params.toString();
      const res = await api.get(`/reports/dashboard${qs ? `?${qs}` : ''}`);
      const overview = res.data?.data ?? res.data;
      return transformDashboardOverview(overview);
    },
    refetchInterval: REFETCH_INTERVAL,
    refetchIntervalInBackground: false,
  });
}

/**
 * Revenue chart data
 */
export function useDashboardRevenue() {
  return useQuery({
    queryKey: ['dashboard', 'revenue'],
    queryFn: async (): Promise<RevenuePoint[]> => {
      const res = await api.get('/reports/dashboard/revenue-chart?months=6');
      const data = res.data?.data ?? res.data;
      return Array.isArray(data)
        ? data.map(
            (r: {
              month: string;
              revenue?: string | number;
              expenses?: string | number;
              profit?: string | number;
            }) => ({
              month: r.month,
              revenue: moneyToNumber(r.revenue),
              expenses: moneyToNumber(r.expenses),
              profit: moneyToNumber(r.profit),
            }),
          )
        : [];
    },
    refetchInterval: REFETCH_INTERVAL,
    refetchIntervalInBackground: false,
  });
}

/**
 * Cash flow chart data
 */
export function useDashboardCashFlow() {
  return useQuery({
    queryKey: ['dashboard', 'cashflow'],
    queryFn: async (): Promise<CashFlowPoint[]> => {
      const res = await api.get('/reports/dashboard/cash-flow-chart?days=180');
      const data = res.data?.data ?? res.data;
      return aggregateCashFlowByMonth(Array.isArray(data) ? data : []);
    },
    refetchInterval: REFETCH_INTERVAL,
    refetchIntervalInBackground: false,
  });
}

/**
 * Expenses by category
 */
export function useDashboardExpenses() {
  return useQuery({
    queryKey: ['dashboard', 'expenses'],
    queryFn: async (): Promise<ExpenseCategory[]> => {
      const now = new Date();
      const startOfMonth = format(new Date(now.getFullYear(), now.getMonth(), 1), 'yyyy-MM-dd');
      const endOfMonth = format(new Date(now.getFullYear(), now.getMonth() + 1, 0), 'yyyy-MM-dd');
      const res = await api.get(
        `/reports/dashboard/expenses-by-category?startDate=${startOfMonth}&endDate=${endOfMonth}`,
      );
      const data = res.data?.data ?? res.data;
      const expenseArray: Array<{ category?: string; amount?: string | number }> = Array.isArray(
        data,
      )
        ? data
        : [];
      // Percentages are a display ratio of API-computed amounts, not money arithmetic.
      const total = expenseArray.reduce((sum: number, e) => sum + moneyToNumber(e.amount), 0);
      return expenseArray.slice(0, 5).map((e) => ({
        name: e.category || 'Other',
        amount: moneyToNumber(e.amount),
        percentage: total > 0 ? Math.round((moneyToNumber(e.amount) / total) * 100) : 0,
      }));
    },
    refetchInterval: REFETCH_INTERVAL,
    refetchIntervalInBackground: false,
  });
}

/**
 * Top customers
 */
export function useDashboardCustomers() {
  return useQuery({
    queryKey: ['dashboard', 'customers'],
    queryFn: async (): Promise<TopCustomer[]> => {
      const res = await api.get('/reports/dashboard/top-customers?limit=5');
      const data = res.data?.data ?? res.data;
      return Array.isArray(data)
        ? data.map(
            (c: {
              id: string;
              name: string;
              totalRevenue?: string | number;
              invoiceCount?: number;
            }) => ({
              id: c.id,
              name: c.name,
              totalRevenue: moneyToNumber(c.totalRevenue),
              invoiceCount: c.invoiceCount || 0,
            }),
          )
        : [];
    },
    refetchInterval: REFETCH_INTERVAL,
    refetchIntervalInBackground: false,
  });
}

/**
 * Bank balance trend
 */
export function useDashboardBanking() {
  return useQuery({
    queryKey: ['dashboard', 'banking'],
    queryFn: async (): Promise<BankBalancePoint[]> => {
      const res = await api.get('/reports/dashboard/bank-balance-trend?months=6');
      const data = res.data?.data ?? res.data;
      return Array.isArray(data)
        ? data.map((b: { month: string; balance?: string | number }) => ({
            month: b.month,
            balance: moneyToNumber(b.balance),
          }))
        : [];
    },
    refetchInterval: REFETCH_INTERVAL,
    refetchIntervalInBackground: false,
  });
}

/**
 * Inventory value trend
 */
export function useDashboardInventory() {
  return useQuery({
    queryKey: ['dashboard', 'inventory'],
    queryFn: async (): Promise<InventoryValuePoint[]> => {
      const res = await api.get('/reports/dashboard/inventory-value-trend?months=6');
      const data = res.data?.data ?? res.data;
      return Array.isArray(data)
        ? data.map((i: { month: string; value?: string | number; itemCount?: number }) => ({
            month: i.month,
            value: moneyToNumber(i.value),
            itemCount: i.itemCount || 0,
          }))
        : [];
    },
    refetchInterval: REFETCH_INTERVAL,
    refetchIntervalInBackground: false,
  });
}

/**
 * Projects overview
 */
export function useDashboardProjects() {
  return useQuery({
    queryKey: ['dashboard', 'projects'],
    queryFn: async (): Promise<ProjectOverview[]> => {
      const res = await api.get('/reports/dashboard/projects');
      const data = res.data?.data ?? res.data;
      return Array.isArray(data)
        ? data.map(
            (p: {
              id: string;
              name: string;
              status?: string;
              hoursLogged?: number;
              revenue?: string | number;
              budget?: string | number;
              budgetUsedPercent?: number;
            }) => ({
              id: p.id,
              name: p.name,
              status: p.status || 'UNKNOWN',
              hoursLogged: p.hoursLogged || 0,
              revenue: moneyToNumber(p.revenue),
              budget: moneyToNumber(p.budget),
              budgetUsedPercent: p.budgetUsedPercent || 0,
            }),
          )
        : [];
    },
    refetchInterval: REFETCH_INTERVAL,
    refetchIntervalInBackground: false,
  });
}

/**
 * Legacy combined hook — kept for backward compatibility.
 * Uses all individual hooks internally.
 */
export function useDashboard() {
  const statsQuery = useDashboardStats();
  const revenueQuery = useDashboardRevenue();
  const cashFlowQuery = useDashboardCashFlow();
  const expensesQuery = useDashboardExpenses();
  const customersQuery = useDashboardCustomers();
  const bankingQuery = useDashboardBanking();
  const inventoryQuery = useDashboardInventory();

  const isLoading = statsQuery.isLoading;
  const isRefetching =
    statsQuery.isRefetching || revenueQuery.isRefetching || cashFlowQuery.isRefetching;

  const data = statsQuery.data
    ? {
        stats: statsQuery.data.stats,
        receivablesVsPayables: statsQuery.data.receivablesVsPayables,
        cashFlowTrend: cashFlowQuery.data || [],
        topExpenses: expensesQuery.data || [],
        revenueTrend: revenueQuery.data || [],
        topCustomers: customersQuery.data || [],
        bankBalanceTrend: bankingQuery.data || [],
        inventoryValueTrend: inventoryQuery.data || [],
        alerts: statsQuery.data.alerts,
        recentTransactions: statsQuery.data.recentTransactions,
      }
    : undefined;

  return { data, isLoading, isRefetching };
}

/**
 * Aggregate daily cash flow data into monthly buckets.
 */
function aggregateCashFlowByMonth(
  daily: Array<{ date: string; cashIn?: string | number; cashOut?: string | number }>,
): CashFlowPoint[] {
  const byMonth: Record<string, { inflow: number; outflow: number }> = {};
  const monthFormatter = new Intl.DateTimeFormat('default', { month: 'short' });

  for (const day of daily) {
    const date = new Date(day.date);
    const key = monthFormatter.format(date);
    if (!byMonth[key]) {
      byMonth[key] = { inflow: 0, outflow: 0 };
    }
    byMonth[key].inflow += moneyToNumber(day.cashIn);
    byMonth[key].outflow += moneyToNumber(day.cashOut);
  }

  return Object.entries(byMonth).map(([month, data]) => ({
    month,
    inflow: data.inflow,
    outflow: data.outflow,
    net: data.inflow - data.outflow,
  }));
}

/**
 * Format currency amount
 */
export function formatCurrency(amount: number, currency: string = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Format compact currency (e.g., $1.2M)
 */
export function formatCompactCurrency(amount: number, currency: string = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(amount);
}

/**
 * Get alert icon and color based on severity
 */
export function getAlertStyles(severity: AIAlert['severity']) {
  switch (severity) {
    case 'error':
      return { color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200' };
    case 'warning':
      return { color: 'text-yellow-600', bg: 'bg-yellow-50', border: 'border-yellow-200' };
    case 'info':
    default:
      return { color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-200' };
  }
}
