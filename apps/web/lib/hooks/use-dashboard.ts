'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

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

const REFETCH_INTERVAL = 60000;

export interface DashboardStatsResult {
  stats: DashboardStats;
  trends: DashboardTrends;
  receivablesVsPayables: ReceivablesPayables;
  alerts: AIAlert[];
  recentTransactions: RecentTransaction[];
}

/**
 * Transform raw dashboard API response into the typed result.
 * Shared between client-side hook and server-side prefetch.
 */
interface DashboardOverviewResponse {
  bankBalances?: Array<{ systemBalance?: number }>;
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
    monthlyRevenue?: number;
    monthlyExpenses?: number;
    monthlyProfit?: number;
    totalReceivables?: number;
    totalPayables?: number;
  };
  trends?: { revenue?: Trend; expenses?: Trend; profit?: Trend };
}

export function transformDashboardOverview(
  overview: DashboardOverviewResponse,
): DashboardStatsResult {
  const now = new Date();

  const bankBalanceTotal = Array.isArray(overview.bankBalances)
    ? overview.bankBalances.reduce(
        (sum: number, b: { systemBalance?: number }) => sum + (b.systemBalance || 0),
        0,
      )
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

  // Map recent activity
  const recentTransactions: RecentTransaction[] = [];
  if (Array.isArray(overview.recentActivity?.invoices)) {
    for (const inv of overview.recentActivity.invoices) {
      recentTransactions.push({
        id: inv.id,
        type: 'INVOICE',
        reference: inv.invoiceNumber,
        description: `Invoice to ${inv.customer?.name || 'Unknown'}`,
        amount: parseFloat(inv.grandTotal?.toString() || inv.total?.toString() || '0'),
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
        amount: -parseFloat(bill.grandTotal?.toString() || bill.total?.toString() || '0'),
        date: bill.createdAt,
        link: `/purchases/bills/${bill.id}`,
      });
    }
  }
  recentTransactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return {
    stats: {
      revenue: overview.overview?.monthlyRevenue || 0,
      expenses: overview.overview?.monthlyExpenses || 0,
      netProfit: overview.overview?.monthlyProfit || 0,
      bankBalance: bankBalanceTotal,
      totalReceivables: overview.overview?.totalReceivables || 0,
      totalPayables: overview.overview?.totalPayables || 0,
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
      receivables: overview.overview?.totalReceivables || 0,
      payables: overview.overview?.totalPayables || 0,
    },
    alerts,
    recentTransactions,
  };
}

/**
 * KPI stats — fastest endpoint, renders first
 */
export function useDashboardStats(dateRange?: { from: Date; to: Date }) {
  const startDate = dateRange?.from?.toISOString().split('T')[0];
  const endDate = dateRange?.to?.toISOString().split('T')[0];

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
            (r: { month: string; revenue?: number; expenses?: number; profit?: number }) => ({
              month: r.month,
              revenue: r.revenue || 0,
              expenses: r.expenses || 0,
              profit: r.profit || 0,
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
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
        .toISOString()
        .split('T')[0];
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0)
        .toISOString()
        .split('T')[0];
      const res = await api.get(
        `/reports/dashboard/expenses-by-category?startDate=${startOfMonth}&endDate=${endOfMonth}`,
      );
      const data = res.data?.data ?? res.data;
      const expenseArray: Array<{ category?: string; amount?: number }> = Array.isArray(data)
        ? data
        : [];
      const total = expenseArray.reduce((sum: number, e) => sum + (e.amount || 0), 0);
      return expenseArray.slice(0, 5).map((e) => ({
        name: e.category || 'Other',
        amount: e.amount || 0,
        percentage: total > 0 ? Math.round(((e.amount || 0) / total) * 100) : 0,
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
            (c: { id: string; name: string; totalRevenue?: number; invoiceCount?: number }) => ({
              id: c.id,
              name: c.name,
              totalRevenue: c.totalRevenue || 0,
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
        ? data.map((b: { month: string; balance?: number }) => ({
            month: b.month,
            balance: b.balance || 0,
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
        ? data.map((i: { month: string; value?: number; itemCount?: number }) => ({
            month: i.month,
            value: i.value || 0,
            itemCount: i.itemCount || 0,
          }))
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
  daily: Array<{ date: string; cashIn?: number; cashOut?: number }>,
): CashFlowPoint[] {
  const byMonth: Record<string, { inflow: number; outflow: number }> = {};
  const monthFormatter = new Intl.DateTimeFormat('default', { month: 'short' });

  for (const day of daily) {
    const date = new Date(day.date);
    const key = monthFormatter.format(date);
    if (!byMonth[key]) {
      byMonth[key] = { inflow: 0, outflow: 0 };
    }
    byMonth[key].inflow += day.cashIn || 0;
    byMonth[key].outflow += day.cashOut || 0;
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
