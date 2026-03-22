'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

// ============ Types ============

// Financial
export interface GrossMarginPoint {
  month: string;
  revenue: number;
  cogs: number;
  marginPercent: number;
}

export interface RevenueYoYPoint {
  month: string;
  currentYear: number;
  previousYear: number;
}

export interface AccountBalance {
  type: string;
  balance: number;
  count: number;
}

export interface VATSummaryItem {
  period: string;
  totalSales: number;
  outputVAT: number;
  totalPurchases: number;
  inputVAT: number;
  netPayable: number;
}

// Sales
export interface InvoiceStatusItem {
  status: string;
  count: number;
  amount: number;
}

export interface QuoteConversionItem {
  status: string;
  count: number;
}

export interface InvoiceVolumePoint {
  month: string;
  count: number;
  amount: number;
}

export interface PaymentCollectionPoint {
  month: string;
  amount: number;
}

export interface ChurnRiskItem {
  segment: string;
  count: number;
}

export interface CLVSegmentItem {
  segment: string;
  count: number;
  avgValue: number;
}

// Purchases
export interface BillStatusItem {
  status: string;
  count: number;
  amount: number;
}

export interface TopVendor {
  id: string;
  name: string;
  totalAmount: number;
  billCount: number;
}

export interface PurchaseTrendPoint {
  month: string;
  bills: number;
  expenses: number;
  total: number;
}

export interface ExpenseTrendPoint {
  month: string;
  amount: number;
  categories: Array<{ name: string; amount: number }>;
}

export interface VendorPaymentTimeItem {
  vendorName: string;
  avgDays: number;
  billCount: number;
}

// HR
export interface PayrollTrendPoint {
  month: string;
  grossPay: number;
  deductions: number;
  netPay: number;
}

export interface DepartmentHeadcountItem {
  department: string;
  count: number;
}

export interface AttendanceOverviewItem {
  status: string;
  count: number;
}

export interface SalaryDistributionItem {
  range: string;
  count: number;
}

export interface AttritionRiskItem {
  level: string;
  count: number;
  percentage: number;
}

// Inventory
export interface StockLevelItem {
  itemName: string;
  currentStock: number;
  reorderLevel: number;
}

export interface InventoryMovementPoint {
  month: string;
  inQty: number;
  outQty: number;
}

export interface ReorderAlertItem {
  itemName: string;
  currentStock: number;
  reorderPoint: number;
  status: string;
}

export interface WorkOrderStatusItem {
  status: string;
  count: number;
}

export interface ProductionEfficiencyPoint {
  month: string;
  planned: number;
  completed: number;
}

// Projects
export interface ProjectBudgetItem {
  name: string;
  budget: number;
  spent: number;
  remaining: number;
}

export interface BillableHoursPoint {
  month: string;
  billable: number;
  nonBillable: number;
}

export interface TaskStatusItem {
  status: string;
  count: number;
}

export interface ProjectProfitabilityItem {
  name: string;
  revenue: number;
  cost: number;
  profit: number;
}

// CRM
export interface DealPipelineItem {
  stage: string;
  count: number;
  value: number;
}

export interface LeadSourceItem {
  source: string;
  count: number;
}

export interface LeadConversionPoint {
  month: string;
  converted: number;
  total: number;
  rate: number;
}

export interface DealWinRatePoint {
  month: string;
  won: number;
  lost: number;
  rate: number;
}

// AI
export interface AnomalyTimelineItem {
  date: string;
  type: string;
  severity: string;
  value: number;
  expectedValue: number;
  description: string;
}

// ============ Hooks ============

const REFETCH_INTERVAL = 60000;

// Financial hooks
export function useGrossMarginTrend(enabled = true) {
  return useQuery({
    queryKey: ['dashboard', 'gross-margin'],
    queryFn: async (): Promise<GrossMarginPoint[]> => {
      const res = await api.get('/reports/dashboard/gross-margin-trend?months=6');
      return res.data?.data ?? res.data ?? [];
    },
    enabled,
    refetchInterval: REFETCH_INTERVAL,
    refetchIntervalInBackground: false,
  });
}

export function useRevenueYoY(enabled = true) {
  return useQuery({
    queryKey: ['dashboard', 'revenue-yoy'],
    queryFn: async (): Promise<RevenueYoYPoint[]> => {
      const res = await api.get('/reports/dashboard/revenue-yoy');
      return res.data?.data ?? res.data ?? [];
    },
    enabled,
    refetchInterval: REFETCH_INTERVAL,
    refetchIntervalInBackground: false,
  });
}

export function useAccountBalances(enabled = true) {
  return useQuery({
    queryKey: ['dashboard', 'account-balances'],
    queryFn: async (): Promise<AccountBalance[]> => {
      const res = await api.get('/reports/dashboard/account-balances');
      return res.data?.data ?? res.data ?? [];
    },
    enabled,
    refetchInterval: REFETCH_INTERVAL,
    refetchIntervalInBackground: false,
  });
}

export function useVATSummary(enabled = true) {
  return useQuery({
    queryKey: ['dashboard', 'vat-summary'],
    queryFn: async (): Promise<VATSummaryItem[]> => {
      const res = await api.get('/reports/dashboard/vat-summary');
      return res.data?.data ?? res.data ?? [];
    },
    enabled,
    refetchInterval: REFETCH_INTERVAL,
    refetchIntervalInBackground: false,
  });
}

// Sales hooks
export function useInvoiceStatus(enabled = true) {
  return useQuery({
    queryKey: ['dashboard', 'invoice-status'],
    queryFn: async (): Promise<InvoiceStatusItem[]> => {
      const res = await api.get('/reports/dashboard/invoice-status');
      return res.data?.data ?? res.data ?? [];
    },
    enabled,
    refetchInterval: REFETCH_INTERVAL,
    refetchIntervalInBackground: false,
  });
}

export function useQuoteConversion(enabled = true) {
  return useQuery({
    queryKey: ['dashboard', 'quote-conversion'],
    queryFn: async (): Promise<QuoteConversionItem[]> => {
      const res = await api.get('/reports/dashboard/quote-conversion');
      return res.data?.data ?? res.data ?? [];
    },
    enabled,
    refetchInterval: REFETCH_INTERVAL,
    refetchIntervalInBackground: false,
  });
}

export function useInvoiceVolume(enabled = true) {
  return useQuery({
    queryKey: ['dashboard', 'invoice-volume'],
    queryFn: async (): Promise<InvoiceVolumePoint[]> => {
      const res = await api.get('/reports/dashboard/invoice-volume?months=6');
      return res.data?.data ?? res.data ?? [];
    },
    enabled,
    refetchInterval: REFETCH_INTERVAL,
    refetchIntervalInBackground: false,
  });
}

export function usePaymentCollection(enabled = true) {
  return useQuery({
    queryKey: ['dashboard', 'payment-collection'],
    queryFn: async (): Promise<PaymentCollectionPoint[]> => {
      const res = await api.get('/reports/dashboard/payment-collection?months=6');
      return res.data?.data ?? res.data ?? [];
    },
    enabled,
    refetchInterval: REFETCH_INTERVAL,
    refetchIntervalInBackground: false,
  });
}

export function useChurnRisk(enabled = true) {
  return useQuery({
    queryKey: ['dashboard', 'churn-risk'],
    queryFn: async (): Promise<ChurnRiskItem[]> => {
      const res = await api.get('/reports/dashboard/churn-risk');
      return res.data?.data ?? res.data ?? [];
    },
    enabled,
    refetchInterval: REFETCH_INTERVAL,
    refetchIntervalInBackground: false,
  });
}

export function useCLVSegments(enabled = true) {
  return useQuery({
    queryKey: ['dashboard', 'clv-segments'],
    queryFn: async (): Promise<CLVSegmentItem[]> => {
      const res = await api.get('/reports/dashboard/clv-segments');
      return res.data?.data ?? res.data ?? [];
    },
    enabled,
    refetchInterval: REFETCH_INTERVAL,
    refetchIntervalInBackground: false,
  });
}

// Purchases hooks
export function useBillStatus(enabled = true) {
  return useQuery({
    queryKey: ['dashboard', 'bill-status'],
    queryFn: async (): Promise<BillStatusItem[]> => {
      const res = await api.get('/reports/dashboard/bill-status');
      return res.data?.data ?? res.data ?? [];
    },
    enabled,
    refetchInterval: REFETCH_INTERVAL,
    refetchIntervalInBackground: false,
  });
}

export function useTopVendors(enabled = true) {
  return useQuery({
    queryKey: ['dashboard', 'top-vendors'],
    queryFn: async (): Promise<TopVendor[]> => {
      const res = await api.get('/reports/dashboard/top-vendors?limit=5');
      return res.data?.data ?? res.data ?? [];
    },
    enabled,
    refetchInterval: REFETCH_INTERVAL,
    refetchIntervalInBackground: false,
  });
}

export function usePurchaseTrend(enabled = true) {
  return useQuery({
    queryKey: ['dashboard', 'purchase-trend'],
    queryFn: async (): Promise<PurchaseTrendPoint[]> => {
      const res = await api.get('/reports/dashboard/purchase-trend?months=6');
      return res.data?.data ?? res.data ?? [];
    },
    enabled,
    refetchInterval: REFETCH_INTERVAL,
    refetchIntervalInBackground: false,
  });
}

export function useExpenseTrend(enabled = true) {
  return useQuery({
    queryKey: ['dashboard', 'expense-trend'],
    queryFn: async (): Promise<ExpenseTrendPoint[]> => {
      const res = await api.get('/reports/dashboard/expense-trend?months=6');
      return res.data?.data ?? res.data ?? [];
    },
    enabled,
    refetchInterval: REFETCH_INTERVAL,
    refetchIntervalInBackground: false,
  });
}

export function useVendorPaymentTime(enabled = true) {
  return useQuery({
    queryKey: ['dashboard', 'vendor-payment-time'],
    queryFn: async (): Promise<VendorPaymentTimeItem[]> => {
      const res = await api.get('/reports/dashboard/vendor-payment-time?limit=10');
      return res.data?.data ?? res.data ?? [];
    },
    enabled,
    refetchInterval: REFETCH_INTERVAL,
    refetchIntervalInBackground: false,
  });
}

// HR hooks
export function usePayrollTrend(enabled = true) {
  return useQuery({
    queryKey: ['dashboard', 'payroll-trend'],
    queryFn: async (): Promise<PayrollTrendPoint[]> => {
      const res = await api.get('/reports/dashboard/payroll-trend?months=6');
      return res.data?.data ?? res.data ?? [];
    },
    enabled,
    refetchInterval: REFETCH_INTERVAL,
    refetchIntervalInBackground: false,
  });
}

export function useDepartmentHeadcount(enabled = true) {
  return useQuery({
    queryKey: ['dashboard', 'department-headcount'],
    queryFn: async (): Promise<DepartmentHeadcountItem[]> => {
      const res = await api.get('/reports/dashboard/department-headcount');
      return res.data?.data ?? res.data ?? [];
    },
    enabled,
    refetchInterval: REFETCH_INTERVAL,
    refetchIntervalInBackground: false,
  });
}

export function useAttendanceOverview(enabled = true) {
  return useQuery({
    queryKey: ['dashboard', 'attendance-overview'],
    queryFn: async (): Promise<AttendanceOverviewItem[]> => {
      const res = await api.get('/reports/dashboard/attendance-overview?days=30');
      return res.data?.data ?? res.data ?? [];
    },
    enabled,
    refetchInterval: REFETCH_INTERVAL,
    refetchIntervalInBackground: false,
  });
}

export function useSalaryDistribution(enabled = true) {
  return useQuery({
    queryKey: ['dashboard', 'salary-distribution'],
    queryFn: async (): Promise<SalaryDistributionItem[]> => {
      const res = await api.get('/reports/dashboard/salary-distribution');
      return res.data?.data ?? res.data ?? [];
    },
    enabled,
    refetchInterval: REFETCH_INTERVAL,
    refetchIntervalInBackground: false,
  });
}

export function useAttritionRisk(enabled = true) {
  return useQuery({
    queryKey: ['dashboard', 'attrition-risk'],
    queryFn: async (): Promise<AttritionRiskItem[]> => {
      const res = await api.get('/reports/dashboard/attrition-risk');
      return res.data?.data ?? res.data ?? [];
    },
    enabled,
    refetchInterval: REFETCH_INTERVAL,
    refetchIntervalInBackground: false,
  });
}

// Inventory hooks
export function useStockLevels(enabled = true) {
  return useQuery({
    queryKey: ['dashboard', 'stock-levels'],
    queryFn: async (): Promise<StockLevelItem[]> => {
      const res = await api.get('/reports/dashboard/stock-levels?limit=15');
      return res.data?.data ?? res.data ?? [];
    },
    enabled,
    refetchInterval: REFETCH_INTERVAL,
    refetchIntervalInBackground: false,
  });
}

export function useInventoryMovements(enabled = true) {
  return useQuery({
    queryKey: ['dashboard', 'inventory-movements'],
    queryFn: async (): Promise<InventoryMovementPoint[]> => {
      const res = await api.get('/reports/dashboard/inventory-movements?months=6');
      return res.data?.data ?? res.data ?? [];
    },
    enabled,
    refetchInterval: REFETCH_INTERVAL,
    refetchIntervalInBackground: false,
  });
}

export function useReorderAlerts(enabled = true) {
  return useQuery({
    queryKey: ['dashboard', 'reorder-alerts'],
    queryFn: async (): Promise<ReorderAlertItem[]> => {
      const res = await api.get('/reports/dashboard/reorder-alerts');
      return res.data?.data ?? res.data ?? [];
    },
    enabled,
    refetchInterval: REFETCH_INTERVAL,
    refetchIntervalInBackground: false,
  });
}

export function useWorkOrderStatus(enabled = true) {
  return useQuery({
    queryKey: ['dashboard', 'work-order-status'],
    queryFn: async (): Promise<WorkOrderStatusItem[]> => {
      const res = await api.get('/reports/dashboard/work-order-status');
      return res.data?.data ?? res.data ?? [];
    },
    enabled,
    refetchInterval: REFETCH_INTERVAL,
    refetchIntervalInBackground: false,
  });
}

export function useProductionEfficiency(enabled = true) {
  return useQuery({
    queryKey: ['dashboard', 'production-efficiency'],
    queryFn: async (): Promise<ProductionEfficiencyPoint[]> => {
      const res = await api.get('/reports/dashboard/production-efficiency?months=6');
      return res.data?.data ?? res.data ?? [];
    },
    enabled,
    refetchInterval: REFETCH_INTERVAL,
    refetchIntervalInBackground: false,
  });
}

// Projects hooks
export function useProjectBudgets(enabled = true) {
  return useQuery({
    queryKey: ['dashboard', 'project-budgets'],
    queryFn: async (): Promise<ProjectBudgetItem[]> => {
      const res = await api.get('/reports/dashboard/project-budgets');
      return res.data?.data ?? res.data ?? [];
    },
    enabled,
    refetchInterval: REFETCH_INTERVAL,
    refetchIntervalInBackground: false,
  });
}

export function useBillableHours(enabled = true) {
  return useQuery({
    queryKey: ['dashboard', 'billable-hours'],
    queryFn: async (): Promise<BillableHoursPoint[]> => {
      const res = await api.get('/reports/dashboard/billable-hours?months=6');
      return res.data?.data ?? res.data ?? [];
    },
    enabled,
    refetchInterval: REFETCH_INTERVAL,
    refetchIntervalInBackground: false,
  });
}

export function useTaskStatus(enabled = true) {
  return useQuery({
    queryKey: ['dashboard', 'task-status'],
    queryFn: async (): Promise<TaskStatusItem[]> => {
      const res = await api.get('/reports/dashboard/task-status');
      return res.data?.data ?? res.data ?? [];
    },
    enabled,
    refetchInterval: REFETCH_INTERVAL,
    refetchIntervalInBackground: false,
  });
}

export function useProjectProfitability(enabled = true) {
  return useQuery({
    queryKey: ['dashboard', 'project-profitability'],
    queryFn: async (): Promise<ProjectProfitabilityItem[]> => {
      const res = await api.get('/reports/dashboard/project-profitability');
      return res.data?.data ?? res.data ?? [];
    },
    enabled,
    refetchInterval: REFETCH_INTERVAL,
    refetchIntervalInBackground: false,
  });
}

// CRM hooks
export function useDealPipeline(enabled = true) {
  return useQuery({
    queryKey: ['dashboard', 'deal-pipeline'],
    queryFn: async (): Promise<DealPipelineItem[]> => {
      const res = await api.get('/reports/dashboard/deal-pipeline');
      return res.data?.data ?? res.data ?? [];
    },
    enabled,
    refetchInterval: REFETCH_INTERVAL,
    refetchIntervalInBackground: false,
  });
}

export function useLeadsBySource(enabled = true) {
  return useQuery({
    queryKey: ['dashboard', 'leads-by-source'],
    queryFn: async (): Promise<LeadSourceItem[]> => {
      const res = await api.get('/reports/dashboard/leads-by-source');
      return res.data?.data ?? res.data ?? [];
    },
    enabled,
    refetchInterval: REFETCH_INTERVAL,
    refetchIntervalInBackground: false,
  });
}

export function useLeadConversionTrend(enabled = true) {
  return useQuery({
    queryKey: ['dashboard', 'lead-conversion-trend'],
    queryFn: async (): Promise<LeadConversionPoint[]> => {
      const res = await api.get('/reports/dashboard/lead-conversion-trend?months=6');
      return res.data?.data ?? res.data ?? [];
    },
    enabled,
    refetchInterval: REFETCH_INTERVAL,
    refetchIntervalInBackground: false,
  });
}

export function useDealWinRate(enabled = true) {
  return useQuery({
    queryKey: ['dashboard', 'deal-win-rate'],
    queryFn: async (): Promise<DealWinRatePoint[]> => {
      const res = await api.get('/reports/dashboard/deal-win-rate?months=6');
      return res.data?.data ?? res.data ?? [];
    },
    enabled,
    refetchInterval: REFETCH_INTERVAL,
    refetchIntervalInBackground: false,
  });
}

// AI hooks
export function useAnomalyTimeline(enabled = true) {
  return useQuery({
    queryKey: ['dashboard', 'anomaly-timeline'],
    queryFn: async (): Promise<AnomalyTimelineItem[]> => {
      const res = await api.get('/reports/dashboard/anomaly-timeline?days=90');
      return res.data?.data ?? res.data ?? [];
    },
    enabled,
    refetchInterval: REFETCH_INTERVAL,
    refetchIntervalInBackground: false,
  });
}
