'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

// Types
export interface DashboardStats {
  revenue: number;
  expenses: number;
  netProfit: number;
  bankBalance: number;
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

export interface DashboardData {
  stats: DashboardStats;
  receivablesVsPayables: ReceivablesPayables;
  cashFlowTrend: CashFlowPoint[];
  topExpenses: ExpenseCategory[];
  revenueTrend: RevenuePoint[];
  alerts: AIAlert[];
  recentTransactions: RecentTransaction[];
}

/**
 * Hook to fetch dashboard data
 */
export function useDashboard() {
  return useQuery({
    queryKey: ['dashboard'],
    queryFn: async () => {
      try {
        const response = await api.get('/dashboard');
        return response.data as DashboardData;
      } catch (error) {
        // Return mock data for development if API not available
        return getMockDashboardData();
      }
    },
    refetchInterval: 60000, // Refresh every minute
  });
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

/**
 * Mock data for development
 */
function getMockDashboardData(): DashboardData {
  return {
    stats: {
      revenue: 125000,
      expenses: 78000,
      netProfit: 47000,
      bankBalance: 234500,
    },
    receivablesVsPayables: {
      receivables: 45000,
      payables: 23000,
    },
    cashFlowTrend: [
      { month: 'Aug', inflow: 42000, outflow: 35000, net: 7000 },
      { month: 'Sep', inflow: 38000, outflow: 32000, net: 6000 },
      { month: 'Oct', inflow: 45000, outflow: 38000, net: 7000 },
      { month: 'Nov', inflow: 52000, outflow: 41000, net: 11000 },
      { month: 'Dec', inflow: 48000, outflow: 45000, net: 3000 },
      { month: 'Jan', inflow: 55000, outflow: 42000, net: 13000 },
    ],
    topExpenses: [
      { name: 'Payroll', amount: 32000, percentage: 41 },
      { name: 'Rent', amount: 15000, percentage: 19 },
      { name: 'Marketing', amount: 12000, percentage: 15 },
      { name: 'Utilities', amount: 8000, percentage: 10 },
      { name: 'Other', amount: 11000, percentage: 14 },
    ],
    revenueTrend: [
      { month: 'Aug', revenue: 18000 },
      { month: 'Sep', revenue: 21000 },
      { month: 'Oct', revenue: 19000 },
      { month: 'Nov', revenue: 24000 },
      { month: 'Dec', revenue: 22000 },
      { month: 'Jan', revenue: 21000 },
    ],
    alerts: [
      {
        id: '1',
        type: 'OVERDUE_INVOICE',
        severity: 'error',
        message: 'Invoice INV-0042 is 15 days overdue ($5,200)',
        link: '/sales/invoices/1',
        createdAt: new Date().toISOString(),
      },
      {
        id: '2',
        type: 'LOW_STOCK',
        severity: 'warning',
        message: 'Widget Pro is below reorder point (5 remaining)',
        link: '/inventory/items/1',
        createdAt: new Date().toISOString(),
      },
      {
        id: '3',
        type: 'OVERDUE_BILL',
        severity: 'warning',
        message: 'Bill BILL-0023 is due tomorrow ($2,100)',
        link: '/purchases/bills/1',
        createdAt: new Date().toISOString(),
      },
    ],
    recentTransactions: [
      {
        id: '1',
        type: 'INVOICE',
        reference: 'INV-0055',
        description: 'Invoice to ABC Corp',
        amount: 4500,
        date: new Date().toISOString(),
        link: '/sales/invoices/1',
      },
      {
        id: '2',
        type: 'PAYMENT_RECEIVED',
        reference: 'PAY-0034',
        description: 'Payment from XYZ Ltd',
        amount: 3200,
        date: new Date(Date.now() - 86400000).toISOString(),
        link: '/sales/payments/1',
      },
      {
        id: '3',
        type: 'EXPENSE',
        reference: 'EXP-0089',
        description: 'Office Supplies',
        amount: -450,
        date: new Date(Date.now() - 172800000).toISOString(),
        link: '/purchases/expenses/1',
      },
      {
        id: '4',
        type: 'BILL',
        reference: 'BILL-0028',
        description: 'Monthly Rent',
        amount: -5000,
        date: new Date(Date.now() - 259200000).toISOString(),
        link: '/purchases/bills/1',
      },
    ],
  };
}
