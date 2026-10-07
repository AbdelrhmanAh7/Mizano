// ============================================
// Reports Types - P&L, Balance Sheet, Aging,
// Cash Flow, Dashboard
// ============================================

// --- Report Building Blocks ---

export interface ReportLineItem {
  accountId: string;
  accountCode: string;
  accountName: string;
  amount: string;
  children?: ReportLineItem[];
}

export interface ReportSection {
  items: ReportLineItem[];
  total: string;
}

// --- Profit & Loss ---

export interface ProfitLossReport {
  startDate: string;
  endDate: string;
  income: ReportLineItem[];
  totalIncome: string;
  expenses: ReportLineItem[];
  totalExpenses: string;
  netProfit: string;
  comparison?: {
    previousPeriod: {
      totalIncome: string;
      totalExpenses: string;
      netProfit: string;
    };
    variance: {
      income: string;
      expenses: string;
      profit: string;
    };
  };
}

// --- Balance Sheet ---

export interface BalanceSheetReport {
  asOfDate: string;
  assets: ReportSection;
  liabilities: ReportSection;
  equity: ReportSection;
  totalAssets: string;
  totalLiabilities: string;
  totalEquity: string;
}

// --- Aging Report ---

export interface AgingBucket {
  entityId: string;
  entityName: string;
  current: string;
  '1-15': string;
  '16-30': string;
  '31-60': string;
  '61-90': string;
  '90+': string;
  total: string;
}

export interface AgingReport {
  asOfDate: string;
  buckets: AgingBucket[];
  summary: {
    current: string;
    '1-15': string;
    '16-30': string;
    '31-60': string;
    '61-90': string;
    '90+': string;
    total: string;
  };
}

// --- Cash Flow Report ---

export interface CashFlowItem {
  description: string;
  amount: string;
}

export interface CashFlowSection {
  items: CashFlowItem[];
  total: string;
}

export interface CashFlowReport {
  startDate: string;
  endDate: string;
  operating: CashFlowSection;
  investing: CashFlowSection;
  financing: CashFlowSection;
  netCashFlow: string;
  openingBalance: string;
  closingBalance: string;
}

// --- Dashboard ---

export interface DashboardStats {
  totalRevenue: string;
  totalExpenses: string;
  netProfit: string;
  bankBalance: string;
  receivables: string;
  payables: string;
  overdueInvoices: number;
  overdueBills: number;
}

export interface DashboardChartData {
  cashFlow: { month: string; inflow: number; outflow: number }[];
  revenueByMonth: { month: string; revenue: number }[];
  expensesByCategory: { category: string; amount: number }[];
  receivablesVsPayables: { receivables: number; payables: number };
}

// --- VAT Return Draft ---

export interface VatReturnDraftException {
  id: string;
  type: 'invoice' | 'bill';
  documentNumber: string;
  reason: string;
}

export const VAT_RETURN_DRAFT_LABEL = 'DRAFT, not for filing' as const;

export interface VatReturnDraft {
  label: typeof VAT_RETURN_DRAFT_LABEL;
  from: string;
  to: string;
  status: 'complete' | 'incomplete';
  outputTax: string;
  inputTax: string;
  netPayable: string;
  exceptions: VatReturnDraftException[];
}
