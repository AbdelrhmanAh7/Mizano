'use client';

import { api } from '@/lib/api';
import { useQuery } from '@tanstack/react-query';

export interface DateRange {
  startDate: string;
  endDate: string;
}

export interface ReportAccount {
  id: string;
  code: string;
  name: string;
  type: string;
  balance: number;
  children?: ReportAccount[];
}

export interface ProfitLossReport {
  income: ReportAccount[];
  expenses: ReportAccount[];
  totalIncome: number;
  totalExpenses: number;
  netProfit: number;
  period: DateRange;
}

export interface BalanceSheetReport {
  assets: ReportAccount[];
  liabilities: ReportAccount[];
  equity: ReportAccount[];
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
  /** Exact decimal string from the API (never recomputed from floats on the client). */
  totalLiabilitiesAndEquity: string;
  /** Decided by the API with exact Decimal comparison. */
  isBalanced: boolean;
  asOfDate: string;
}

export interface CashFlowReport {
  operations: {
    netIncome: number;
    adjustments: Array<{ key?: string; name: string; amount: number }>;
    total: number;
  };
  investing: {
    items: Array<{ key?: string; name: string; amount: number }>;
    total: number;
  };
  financing: {
    items: Array<{ key?: string; name: string; amount: number }>;
    total: number;
  };
  netChange: number;
  openingBalance: number;
  closingBalance: number;
  period: DateRange;
}

export interface AgingBucket {
  range: string;
  amount: number;
  count: number;
  items: Array<{
    id: string;
    number: string;
    date: string;
    dueDate: string;
    counterpartyName: string;
    amount: number;
    balanceDue: number;
    daysOverdue: number;
  }>;
}

export interface AgingReport {
  buckets: AgingBucket[];
  /** Control-account total: open balances minus unapplied credit notes. */
  total: number;
  /** Open document balances before unapplied credit notes (the sum of the buckets). */
  grossTotal: number;
  /** Credit notes/vendor credits that reduced the control account but no document. */
  unappliedCredits: number;
  totalCount: number;
  asOfDate: string;
}

export interface GeneralLedgerEntry {
  date: string;
  reference: string;
  description: string;
  debit: number;
  credit: number;
  runningBalance: number;
  journalId: string;
}

export interface GeneralLedgerReport {
  account: {
    id: string;
    code: string;
    name: string;
    type: string;
  };
  openingBalance: number;
  entries: GeneralLedgerEntry[];
  closingBalance: number;
  totalDebits: number;
  totalCredits: number;
  period: DateRange;
}

export interface TrialBalanceAccount {
  id: string;
  code: string;
  name: string;
  type: string;
  debit: number;
  credit: number;
}

export interface TrialBalanceReport {
  accounts: TrialBalanceAccount[];
  totalDebits: number;
  totalCredits: number;
  isBalanced: boolean;
  asOfDate: string;
}

// API functions — URLs aligned with backend controller routes
const reportsApi = {
  getProfitLoss: (params: DateRange) => api.get('/reports/profit-and-loss', { params }),
  getBalanceSheet: (params: { asOfDate: string }) => api.get('/reports/balance-sheet', { params }),
  getCashFlow: (params: DateRange) => api.get('/reports/cash-flow', { params }),
  getARaging: (params?: { asOfDate?: string }) => api.get('/reports/receivables-aging', { params }),
  getAPAging: (params?: { asOfDate?: string }) => api.get('/reports/payables-aging', { params }),
  getGeneralLedger: (accountId: string, params: DateRange) =>
    api.get(`/reports/general-ledger/${accountId}`, { params }),
  getTrialBalance: (params: { asOfDate: string }) => api.get('/reports/trial-balance', { params }),
  getSalesByCustomer: (params: DateRange) => api.get('/reports/sales-by-customer', { params }),
  getSalesByItem: (params: DateRange) => api.get('/reports/sales-by-item', { params }),
  getPurchasesByVendor: (params: DateRange) => api.get('/reports/purchases-by-vendor', { params }),
};

// --- New report interfaces ---
export interface SalesByCustomerEntry {
  customerId: string;
  customerName: string;
  invoiceCount: number;
  totalAmount: number;
  paidAmount: number;
  balanceDue: number;
}

export interface SalesByCustomerReport {
  entries: SalesByCustomerEntry[];
  totalAmount: number;
  totalPaid: number;
  totalBalance: number;
  period: DateRange;
}

export interface SalesByItemEntry {
  itemId: string;
  itemName: string;
  sku: string;
  quantitySold: number;
  totalAmount: number;
  averagePrice: number;
}

export interface SalesByItemReport {
  entries: SalesByItemEntry[];
  totalAmount: number;
  totalQuantity: number;
  period: DateRange;
}

export interface PurchasesByVendorEntry {
  vendorId: string;
  vendorName: string;
  billCount: number;
  totalAmount: number;
  paidAmount: number;
  balanceDue: number;
  /** Decimal string: live unapplied vendor credits dated in the period (debited from AP, not on any bill). */
  unappliedCredits: string;
  /** Decimal string: balanceDue - unappliedCredits. */
  netPayable: string;
}

export interface PurchasesByVendorReport {
  entries: PurchasesByVendorEntry[];
  totalAmount: number;
  totalPaid: number;
  totalBalance: number;
  /** Decimal strings. */
  totalUnappliedCredits: string;
  totalNetPayable: string;
  period: DateRange;
}

// ---------------------------------------------------------------------------
// Raw API response shapes for transform functions
// ---------------------------------------------------------------------------

interface RawAccountData {
  id?: string;
  accountId?: string;
  code?: string;
  name?: string;
  type?: string;
  balance?: number | string;
  children?: RawAccountData[];
}

interface RawAccountGroup {
  accounts?: RawAccountData[];
  total?: number | string;
}

interface RawBalanceSheetData {
  assets?: RawAccountGroup & { current?: RawAccountGroup; fixed?: RawAccountGroup };
  liabilities?: RawAccountGroup & { current?: RawAccountGroup; longTerm?: RawAccountGroup };
  equity?: RawAccountGroup & { retainedEarnings?: number | string };
  totalAssets?: number | string;
  totalLiabilities?: number | string;
  totalEquity?: number | string;
  totalLiabilitiesAndEquity?: number | string;
  isBalanced?: boolean;
  asOfDate?: string;
}

interface RawProfitLossData {
  income?: RawAccountData[];
  revenue?: RawAccountGroup;
  expenses?: RawAccountData[];
  costOfGoodsSold?: RawAccountGroup;
  operatingExpenses?: RawAccountGroup;
  totalIncome?: number | string;
  totalExpenses?: number | string;
  netProfit?: number | string;
  period?: DateRange;
}

interface RawTrialBalanceAccount {
  id?: string;
  accountId?: string;
  code?: string;
  name?: string;
  type?: string;
  debit?: number;
  credit?: number;
}

interface RawTrialBalanceData {
  accounts?: RawTrialBalanceAccount[];
  totalDebits?: number;
  totalCredits?: number;
  totals?: { debit?: number; credit?: number };
  isBalanced?: boolean;
  asOfDate?: string;
}

interface RawAgingItem {
  invoiceId?: string;
  billId?: string;
  invoiceNumber?: string;
  billNumber?: string;
  /** Accounting date; preferred over issueDate/billDate. */
  date?: string;
  issueDate?: string;
  billDate?: string;
  dueDate?: string;
  customerName?: string;
  vendorName?: string;
  counterpartyName?: string;
  amount?: string | number;
  balanceDue?: string | number;
  daysOverdue?: number;
}

interface RawAgingBucket {
  range?: string;
  amount?: string | number;
  count?: number;
  items?: RawAgingItem[];
}

interface RawAgingData {
  buckets?: RawAgingBucket[] | Record<string, RawAgingItem[]>;
  summary?: Record<string, string | number>;
  total?: string | number;
  totalCount?: number;
  invoiceCount?: number;
  billCount?: number;
  asOfDate?: string;
}

// ---------------------------------------------------------------------------
// Backend → Frontend data transformers
// ---------------------------------------------------------------------------

function unwrap<T = unknown>(response: { data?: { data?: unknown } & Record<string, unknown> }): T {
  return (response.data?.data ?? response.data) as T;
}

/** Report money arrives as decimal strings; convert once for display (never for posting). */
function toNum(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function toReportAccount(a: RawAccountData): ReportAccount {
  return {
    id: a.id || a.accountId || '',
    code: a.code || '',
    name: a.name || '',
    type: a.type || '',
    // API sends decimal strings; ReportAccount.balance is a display number.
    balance: toNum(a.balance),
    children: Array.isArray(a.children) ? a.children.map(toReportAccount) : undefined,
  };
}

function transformBalanceSheet(raw: RawBalanceSheetData): BalanceSheetReport {
  const assets: ReportAccount[] = [];
  if (raw.assets) {
    if (raw.assets.current?.accounts) {
      assets.push({
        id: 'current-assets',
        code: '',
        name: 'Current Assets',
        type: 'ASSET',
        balance: toNum(raw.assets.current.total),
        children: (Array.isArray(raw.assets.current.accounts)
          ? raw.assets.current.accounts
          : []
        ).map(toReportAccount),
      });
    }
    if (raw.assets.fixed?.accounts) {
      assets.push({
        id: 'fixed-assets',
        code: '',
        name: 'Fixed Assets',
        type: 'ASSET',
        balance: toNum(raw.assets.fixed.total),
        children: (Array.isArray(raw.assets.fixed.accounts) ? raw.assets.fixed.accounts : []).map(
          toReportAccount,
        ),
      });
    }
    // If backend already returns flat array (fallback)
    if (Array.isArray(raw.assets)) {
      assets.push(...raw.assets.map(toReportAccount));
    }
  }

  const liabilities: ReportAccount[] = [];
  if (raw.liabilities) {
    if (raw.liabilities.current?.accounts) {
      liabilities.push({
        id: 'current-liabilities',
        code: '',
        name: 'Current Liabilities',
        type: 'LIABILITY',
        balance: toNum(raw.liabilities.current.total),
        children: (Array.isArray(raw.liabilities.current.accounts)
          ? raw.liabilities.current.accounts
          : []
        ).map(toReportAccount),
      });
    }
    if (raw.liabilities.longTerm?.accounts) {
      liabilities.push({
        id: 'long-term-liabilities',
        code: '',
        name: 'Long-Term Liabilities',
        type: 'LIABILITY',
        balance: toNum(raw.liabilities.longTerm.total),
        children: (Array.isArray(raw.liabilities.longTerm.accounts)
          ? raw.liabilities.longTerm.accounts
          : []
        ).map(toReportAccount),
      });
    }
    if (Array.isArray(raw.liabilities)) {
      liabilities.push(...raw.liabilities.map(toReportAccount));
    }
  }

  const equity: ReportAccount[] = [];
  if (raw.equity) {
    if (Array.isArray(raw.equity.accounts)) {
      equity.push(...raw.equity.accounts.map(toReportAccount));
    }
    if (raw.equity.retainedEarnings !== undefined && raw.equity.retainedEarnings !== null) {
      equity.push({
        id: 'retained-earnings',
        code: '3100',
        name: 'Retained Earnings',
        type: 'EQUITY',
        balance: toNum(raw.equity.retainedEarnings),
      });
    }
    if (Array.isArray(raw.equity)) {
      equity.push(...raw.equity.map(toReportAccount));
    }
  }

  return {
    assets,
    liabilities,
    equity,
    totalAssets: toNum(raw.assets?.total ?? raw.totalAssets),
    totalLiabilities: toNum(raw.liabilities?.total ?? raw.totalLiabilities),
    totalEquity: toNum(raw.equity?.total ?? raw.totalEquity),
    totalLiabilitiesAndEquity: String(raw.totalLiabilitiesAndEquity ?? '0'),
    isBalanced: raw.isBalanced === true,
    asOfDate: raw.asOfDate ?? '',
  };
}

function transformProfitLoss(raw: RawProfitLossData): ProfitLossReport {
  const income: ReportAccount[] = Array.isArray(raw.income)
    ? raw.income.map(toReportAccount)
    : Array.isArray(raw.revenue?.accounts)
      ? raw.revenue!.accounts!.map(toReportAccount)
      : [];

  const expenses: ReportAccount[] = [];
  if (Array.isArray(raw.expenses)) {
    expenses.push(...raw.expenses.map(toReportAccount));
  } else {
    if (Array.isArray(raw.costOfGoodsSold?.accounts)) {
      expenses.push(...raw.costOfGoodsSold!.accounts!.map(toReportAccount));
    }
    if (Array.isArray(raw.operatingExpenses?.accounts)) {
      expenses.push(...raw.operatingExpenses!.accounts!.map(toReportAccount));
    }
  }

  const totalIncome = toNum(raw.totalIncome ?? raw.revenue?.total);
  const totalExpenses =
    raw.totalExpenses !== undefined
      ? toNum(raw.totalExpenses)
      : toNum(raw.costOfGoodsSold?.total) + toNum(raw.operatingExpenses?.total);

  return {
    income,
    expenses,
    totalIncome,
    totalExpenses,
    netProfit: raw.netProfit !== undefined ? toNum(raw.netProfit) : totalIncome - totalExpenses,
    period: raw.period ?? { startDate: '', endDate: '' },
  };
}

function transformTrialBalance(raw: RawTrialBalanceData): TrialBalanceReport {
  const accounts: TrialBalanceAccount[] = Array.isArray(raw.accounts)
    ? raw.accounts.map((a: RawTrialBalanceAccount) => ({
        id: a.id || a.accountId || '',
        code: a.code || '',
        name: a.name || '',
        type: a.type || '',
        debit: toNum(a.debit),
        credit: toNum(a.credit),
      }))
    : [];

  return {
    accounts,
    totalDebits: toNum(raw.totalDebits ?? raw.totals?.debit),
    totalCredits: toNum(raw.totalCredits ?? raw.totals?.credit),
    isBalanced: raw.isBalanced ?? false,
    asOfDate: raw.asOfDate ?? '',
  };
}

const AGING_BUCKET_MAP: Array<{ key: string; range: string }> = [
  { key: 'current', range: 'current' },
  { key: 'days1_30', range: '1-30' },
  { key: 'days31_60', range: '31-60' },
  { key: 'days61_90', range: '61-90' },
  { key: 'over90', range: '90+' },
];

function transformAgingReport(
  raw: RawAgingData,
  counterpartyField: 'customerName' | 'vendorName',
): AgingReport {
  // If already in the expected array format
  if (Array.isArray(raw.buckets)) {
    const total = toNum(raw.total ?? raw.summary?.total);
    return {
      buckets: raw.buckets.map((b: RawAgingBucket) => ({
        range: b.range ?? '',
        amount: toNum(b.amount),
        count: b.count ?? 0,
        items: Array.isArray(b.items) ? (b.items as AgingBucket['items']) : [],
      })),
      total,
      grossTotal: total,
      unappliedCredits: 0,
      totalCount: raw.totalCount ?? raw.invoiceCount ?? raw.billCount ?? 0,
      asOfDate: raw.asOfDate ?? '',
    };
  }

  // Transform named-bucket object format from backend (money as decimal strings)
  const namedBuckets = raw.buckets as Record<string, RawAgingItem[]> | undefined;
  const buckets: AgingBucket[] = AGING_BUCKET_MAP.map(({ key, range }) => {
    const items = Array.isArray(namedBuckets?.[key]) ? namedBuckets![key] : [];
    return {
      range,
      amount: toNum(raw.summary?.[key]),
      count: items.length,
      items: items.map((item: RawAgingItem) => ({
        id: item.invoiceId || item.billId || '',
        number: item.invoiceNumber || item.billNumber || '',
        date: item.date || item.issueDate || item.billDate || '',
        dueDate: item.dueDate || '',
        counterpartyName: item[counterpartyField] || item.counterpartyName || '',
        amount: toNum(item.amount ?? item.balanceDue),
        balanceDue: toNum(item.balanceDue),
        daysOverdue: item.daysOverdue ?? 0,
      })),
    };
  });

  return {
    buckets,
    // The API's netTotal reconciles to the AR/AP control account.
    total: toNum(raw.summary?.netTotal ?? raw.summary?.total),
    grossTotal: toNum(raw.summary?.total),
    unappliedCredits: toNum(raw.summary?.unappliedCredits),
    totalCount: raw.invoiceCount ?? raw.billCount ?? 0,
    asOfDate: raw.asOfDate ?? '',
  };
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

export function useProfitLossReport(params: DateRange) {
  return useQuery<ProfitLossReport>({
    queryKey: ['reports', 'profit-loss', params],
    queryFn: async () => {
      const response = await reportsApi.getProfitLoss(params);
      return transformProfitLoss(unwrap<RawProfitLossData>(response));
    },
    enabled: !!params.startDate && !!params.endDate,
  });
}

export function useBalanceSheetReport(asOfDate: string) {
  return useQuery<BalanceSheetReport>({
    queryKey: ['reports', 'balance-sheet', asOfDate],
    queryFn: async () => {
      const response = await reportsApi.getBalanceSheet({ asOfDate });
      return transformBalanceSheet(unwrap<RawBalanceSheetData>(response));
    },
    enabled: !!asOfDate,
  });
}

interface CashFlowSection {
  items: Array<{ key?: string; name: string; amount: number }>;
  total: number;
}
interface TransformedCashFlowReport {
  operatingActivities: CashFlowSection;
  investingActivities: CashFlowSection;
  financingActivities: CashFlowSection;
  netCashFlow: number;
  openingBalance: number;
  closingBalance: number;
}

interface CashFlowApiResponse {
  openingCashBalance?: number | string;
  operating?: {
    netIncome?: number | string;
    adjustments?: {
      accountsReceivableChange?: number | string;
      accountsPayableChange?: number | string;
      inventoryChange?: number | string;
      otherOperatingChanges?: number | string;
    };
    netCashFromOperating?: number | string;
  };
  investing?: {
    fixedAssetPurchases?: number | string;
    netCashFromInvesting?: number | string;
  };
  financing?: {
    equityChanges?: number | string;
    debtChanges?: number | string;
    netCashFromFinancing?: number | string;
  };
  netCashChange?: number | string;
  closingCashBalance?: number | string;
}

function transformCashFlow(raw: CashFlowApiResponse): TransformedCashFlowReport {
  const opAdj = raw.operating?.adjustments ?? {};
  return {
    operatingActivities: {
      items: [
        { key: 'netIncome', name: 'Net Income', amount: toNum(raw.operating?.netIncome) },
        {
          key: 'accountsReceivableChange',
          name: 'Accounts Receivable Change',
          amount: toNum(opAdj.accountsReceivableChange),
        },
        {
          key: 'accountsPayableChange',
          name: 'Accounts Payable Change',
          amount: toNum(opAdj.accountsPayableChange),
        },
        { key: 'inventoryChange', name: 'Inventory Change', amount: toNum(opAdj.inventoryChange) },
        // Keeps the visible items summing to the operating total.
        {
          key: 'otherOperatingChanges',
          name: 'Other Operating Changes',
          amount: toNum(opAdj.otherOperatingChanges),
        },
      ],
      total: toNum(raw.operating?.netCashFromOperating),
    },
    investingActivities: {
      items: [
        {
          key: 'fixedAssetPurchases',
          name: 'Fixed Asset Purchases',
          amount: toNum(raw.investing?.fixedAssetPurchases),
        },
      ],
      total: toNum(raw.investing?.netCashFromInvesting),
    },
    financingActivities: {
      items: [
        {
          key: 'equityChanges',
          name: 'Equity Changes',
          amount: toNum(raw.financing?.equityChanges),
        },
        { key: 'debtChanges', name: 'Debt Changes', amount: toNum(raw.financing?.debtChanges) },
      ],
      total: toNum(raw.financing?.netCashFromFinancing),
    },
    netCashFlow: toNum(raw.netCashChange),
    openingBalance: toNum(raw.openingCashBalance),
    closingBalance: toNum(raw.closingCashBalance),
  };
}

export function useCashFlowReport(params: DateRange) {
  return useQuery<TransformedCashFlowReport>({
    queryKey: ['reports', 'cash-flow', params],
    queryFn: async () => {
      const response = await reportsApi.getCashFlow(params);
      return transformCashFlow(unwrap<CashFlowApiResponse>(response));
    },
    enabled: !!params.startDate && !!params.endDate,
  });
}

export function useARAgingReport(asOfDate?: string) {
  return useQuery<AgingReport>({
    queryKey: ['reports', 'ar-aging', asOfDate],
    queryFn: async () => {
      const response = await reportsApi.getARaging({ asOfDate });
      return transformAgingReport(unwrap<RawAgingData>(response), 'customerName');
    },
  });
}

export function useAPAgingReport(asOfDate?: string) {
  return useQuery<AgingReport>({
    queryKey: ['reports', 'ap-aging', asOfDate],
    queryFn: async () => {
      const response = await reportsApi.getAPAging({ asOfDate });
      return transformAgingReport(unwrap<RawAgingData>(response), 'vendorName');
    },
  });
}

export function useGeneralLedgerReport(accountId: string, params: DateRange) {
  return useQuery<GeneralLedgerReport>({
    queryKey: ['reports', 'general-ledger', accountId, params],
    queryFn: async () => {
      const response = await reportsApi.getGeneralLedger(accountId, params);
      return unwrap<GeneralLedgerReport>(response);
    },
    enabled: !!accountId && !!params.startDate && !!params.endDate,
  });
}

export function useTrialBalanceReport(asOfDate: string) {
  return useQuery<TrialBalanceReport>({
    queryKey: ['reports', 'trial-balance', asOfDate],
    queryFn: async () => {
      const response = await reportsApi.getTrialBalance({ asOfDate });
      return transformTrialBalance(unwrap<RawTrialBalanceData>(response));
    },
    enabled: !!asOfDate,
  });
}

// --- New report hooks ---

export function useSalesByCustomerReport(params: DateRange) {
  return useQuery<SalesByCustomerReport>({
    queryKey: ['reports', 'sales-by-customer', params],
    queryFn: async () => {
      const response = await reportsApi.getSalesByCustomer(params);
      return response.data?.data || response.data;
    },
    enabled: !!params.startDate && !!params.endDate,
  });
}

export function useSalesByItemReport(params: DateRange) {
  return useQuery<SalesByItemReport>({
    queryKey: ['reports', 'sales-by-item', params],
    queryFn: async () => {
      const response = await reportsApi.getSalesByItem(params);
      return response.data?.data || response.data;
    },
    enabled: !!params.startDate && !!params.endDate,
  });
}

export function usePurchasesByVendorReport(params: DateRange) {
  return useQuery<PurchasesByVendorReport>({
    queryKey: ['reports', 'purchases-by-vendor', params],
    queryFn: async () => {
      const response = await reportsApi.getPurchasesByVendor(params);
      return response.data?.data || response.data;
    },
    enabled: !!params.startDate && !!params.endDate,
  });
}

// Helper functions
export function formatCurrency(amount: number | string | null | undefined): string {
  if (amount === null || amount === undefined) return '$0.00';
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(num);
}

export function getAgingBucketLabel(bucket: string): string {
  const labels: Record<string, string> = {
    current: 'Current',
    '1-15': '1-15 Days',
    '16-30': '16-30 Days',
    '31-60': '31-60 Days',
    '61-90': '61-90 Days',
    '90+': 'Over 90 Days',
  };
  return labels[bucket] || bucket;
}

export function getAgingBucketColor(bucket: string): string {
  const colors: Record<string, string> = {
    current: 'bg-green-100 text-green-800',
    '1-15': 'bg-blue-100 text-blue-800',
    '16-30': 'bg-yellow-100 text-yellow-800',
    '31-60': 'bg-orange-100 text-orange-800',
    '61-90': 'bg-red-100 text-red-800',
    '90+': 'bg-red-200 text-red-900',
  };
  return colors[bucket] || 'bg-gray-100 text-gray-800';
}
