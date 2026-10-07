import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { getSession, signOut } from 'next-auth/react';
import { createCrudApi } from './api/create-api-client';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:6001/api';

// ---------------------------------------------------------------------------
// Session caching (with in-flight deduplication)
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let cachedSession: any = null;
let sessionCacheTimestamp = 0;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let sessionPromise: Promise<any> | null = null;
const SESSION_CACHE_TTL = 30_000; // 30 seconds

async function getCachedSession() {
  const now = Date.now();
  if (cachedSession && now - sessionCacheTimestamp < SESSION_CACHE_TTL) {
    return cachedSession;
  }

  // Deduplicate: if a getSession() call is already in-flight, reuse it
  if (!sessionPromise) {
    sessionPromise = getSession().finally(() => {
      sessionPromise = null;
    });
  }

  cachedSession = await sessionPromise;
  sessionCacheTimestamp = Date.now();
  return cachedSession;
}

export function invalidateSessionCache() {
  cachedSession = null;
  sessionCacheTimestamp = 0;
  sessionPromise = null;
}

// ---------------------------------------------------------------------------
// Refresh queue
// ---------------------------------------------------------------------------

let isRefreshing = false;
let failedQueue: Array<{
  resolve: (token: string) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  reject: (error: any) => void;
}> = [];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function processQueue(error: any, token: string | null = null) {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token!);
    }
  });
  failedQueue = [];
}

// ---------------------------------------------------------------------------
// Redirect deduplication
// ---------------------------------------------------------------------------

let isRedirecting = false;

function redirectToLogin() {
  if (isRedirecting) return;
  isRedirecting = true;
  if (typeof window !== 'undefined') {
    invalidateSessionCache();
    signOut({ callbackUrl: '/login' });
  }
}

// ---------------------------------------------------------------------------
// Axios instances
// ---------------------------------------------------------------------------

// Public API client for auth endpoints (no session interceptor)
const publicApi = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
});

// Authenticated API client (with session interceptor)
const api = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
});

// REQUEST INTERCEPTOR: Use cached session
api.interceptors.request.use(async (config) => {
  if (typeof window !== 'undefined') {
    const session = await getCachedSession();
    if (session?.accessToken) {
      config.headers.Authorization = `Bearer ${session.accessToken}`;
    }
  }
  return config;
});

// RESPONSE INTERCEPTOR: Handle 401 with refresh queue
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    if (typeof window === 'undefined' || error.response?.status !== 401 || originalRequest._retry) {
      return Promise.reject(error);
    }

    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        failedQueue.push({
          resolve: (token: string) => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            resolve(api(originalRequest));
          },
          reject,
        });
      });
    }

    originalRequest._retry = true;
    isRefreshing = true;

    try {
      const oldToken = originalRequest.headers.Authorization?.toString().replace('Bearer ', '');
      invalidateSessionCache();
      const newSession = await getSession();

      if (!newSession?.accessToken || newSession.error === 'RefreshAccessTokenError') {
        processQueue(new Error('Refresh failed'), null);
        redirectToLogin();
        return Promise.reject(error);
      }

      // Stale token check: if refresh returned the same token, it's invalid
      if (newSession.accessToken === oldToken) {
        processQueue(new Error('Token refresh returned stale token'), null);
        redirectToLogin();
        return Promise.reject(error);
      }

      cachedSession = newSession;
      sessionCacheTimestamp = Date.now();

      const newToken = newSession.accessToken;
      processQueue(null, newToken);

      originalRequest.headers.Authorization = `Bearer ${newToken}`;
      return api(originalRequest);
    } catch (refreshError) {
      processQueue(refreshError, null);
      redirectToLogin();
      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  },
);

export default api;

// ---------------------------------------------------------------------------
// Helper: shorthand for creating CRUD api with the authenticated instance
// ---------------------------------------------------------------------------

function crud(endpoint: string, opts?: { updateMethod?: 'patch' | 'put'; hasCursor?: boolean }) {
  return createCrudApi(
    { endpoint, updateMethod: opts?.updateMethod, hasCursor: opts?.hasCursor },
    api,
  );
}

// ===========================================================================
// Auth API (public - no session interceptor)
// ===========================================================================

export const authApi = {
  login: (email: string, password: string) => publicApi.post('/auth/login', { email, password }),
  register: (data: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    organizationName: string;
  }) => publicApi.post('/auth/register', data),
  refreshToken: (refreshToken: string) => publicApi.post('/auth/refresh', { refreshToken }),
};

// ===========================================================================
// Dashboard API (no CRUD pattern)
// ===========================================================================

export const dashboardApi = {
  getOverview: () => api.get('/reports/dashboard'),
  getRevenueChart: (months?: number) =>
    api.get(`/reports/dashboard/revenue-chart${months ? `?months=${months}` : ''}`),
  getCashFlowChart: (days?: number) =>
    api.get(`/reports/dashboard/cash-flow-chart${days ? `?days=${days}` : ''}`),
  getTopCustomers: (limit?: number) =>
    api.get(`/reports/dashboard/top-customers${limit ? `?limit=${limit}` : ''}`),
};

// ===========================================================================
// Sales
// ===========================================================================

export const customersApi = {
  ...crud('/customers'),
  getStatement: (id: string, params?: Record<string, unknown>) =>
    api.get(`/customers/${id}/statement`, { params }),
  bulkDelete: (ids: string[]) => api.post('/customers/bulk-delete', { ids }),
};

export const quotesApi = {
  ...crud('/quotes'),
  send: (id: string) => api.patch(`/quotes/${id}/send`),
  accept: (id: string) => api.patch(`/quotes/${id}/accept`),
  decline: (id: string) => api.patch(`/quotes/${id}/decline`),
  convertToInvoice: (id: string) => api.post(`/quotes/${id}/convert-to-invoice`),
  clone: (id: string) => api.post(`/quotes/${id}/clone`),
  bulkDelete: (ids: string[]) => api.post('/quotes/bulk-delete', { ids }),
  bulkSend: (ids: string[]) => api.post('/quotes/bulk-send', { ids }),
  bulkDecline: (ids: string[]) => api.post('/quotes/bulk-decline', { ids }),
};

export const invoicesApi = {
  ...crud('/invoices'),
  send: (id: string) => api.patch(`/invoices/${id}/send`),
  void: (id: string) => api.patch(`/invoices/${id}/void`),
  clone: (id: string) => api.post(`/invoices/${id}/clone`),
  bulkDelete: (ids: string[]) => api.post('/invoices/bulk-delete', { ids }),
  bulkSend: (ids: string[]) => api.post('/invoices/bulk-send', { ids }),
  bulkVoid: (ids: string[]) => api.post('/invoices/bulk-void', { ids }),
  /** Records a full-balance payment per invoice; returns { processed, total, failures }. */
  bulkPay: (
    ids: string[],
    options?: { depositToAccountId?: string; date?: string; paymentMode?: string },
  ) => api.post('/invoices/bulk-pay', { ids, ...options }),
};

export const creditNotesApi = {
  ...crud('/credit-notes'),
  bulkDelete: (ids: string[]) => api.post('/credit-notes/bulk-delete', { ids }),
  /** Bank/cash accounts a REFUND can be paid from (sales.create; no accounting.view needed). */
  refundAccounts: () => api.get('/credit-notes/refund-accounts'),
};

export const paymentsReceivedApi = {
  ...crud('/payments-received'),
  /** Voids a payment: restores invoice balances and posts a linked reversal journal. */
  void: (id: string) => api.post(`/payments-received/${id}/void`),
  bulkDelete: (ids: string[]) => api.post('/payments-received/bulk-delete', { ids }),
};

export const deliveryChallansApi = {
  ...crud('/delivery-challans'),
  issue: (id: string) => api.post(`/delivery-challans/${id}/issue`),
  markReturned: (id: string) => api.post(`/delivery-challans/${id}/mark-returned`),
  bulkDelete: (ids: string[]) => api.post('/delivery-challans/bulk-delete', { ids }),
  bulkIssue: (ids: string[]) => api.post('/delivery-challans/bulk-issue', { ids }),
};

// ===========================================================================
// Purchases
// ===========================================================================

export const vendorsApi = {
  ...crud('/vendors'),
  bulkDelete: (ids: string[]) => api.post('/vendors/bulk-delete', { ids }),
};

export const expensesApi = {
  ...crud('/expenses'),
  bulkDelete: (ids: string[]) => api.post('/expenses/bulk-delete', { ids }),
  bulkCategorize: (ids: string[], accountId: string) =>
    api.post('/expenses/bulk-categorize', { ids, accountId }),
  bulkApprove: (ids: string[]) => api.post('/expenses/bulk-approve', { ids }),
  /** Expense-type accounts for the expense form (purchases.create; no accounting.view needed). */
  /** Posts a pending expense (Dr expense / VAT, Cr bank or cash). */
  post: (id: string) => api.post(`/expenses/${id}/post`),
  expenseAccounts: () => api.get('/expenses/expense-accounts'),
  /** Bank/cash accounts an expense can be paid from (purchases.create). */
  paidThroughAccounts: () => api.get('/expenses/paid-through-accounts'),
};

export const billsApi = {
  ...crud('/bills'),
  open: (id: string) => api.patch(`/bills/${id}/open`),
  /** Approves a draft bill and posts its journal (Dr expense/VAT, Cr AP) on the bill date. */
  approve: (id: string) => api.post(`/bills/${id}/approve`),
  clone: (id: string) => api.post(`/bills/${id}/clone`),
  /** Posted bills of the same vendor, amount and currency within ±3 days (read-only). */
  possibleDuplicates: (id: string) => api.get(`/bills/${id}/possible-duplicates`),
  bulkDelete: (ids: string[]) => api.post('/bills/bulk-delete', { ids }),
  bulkOpen: (ids: string[]) => api.post('/bills/bulk-open', { ids }),
  bulkApprove: (ids: string[]) => api.post('/bills/bulk-approve', { ids }),
  /** Records a full-balance payment per bill (default bank/cash account unless given). */
  bulkPay: (
    ids: string[],
    options?: { paidFromAccountId?: string; date?: string; paymentMode?: string },
  ) => api.post('/bills/bulk-pay', { ids, ...options }),
};

export const paymentsMadeApi = {
  ...crud('/payments-made'),
  /** Voids a payment: restores bill balances and posts a linked reversal journal. */
  void: (id: string) => api.delete(`/payments-made/${id}`),
  bulkDelete: (ids: string[]) => api.post('/payments-made/bulk-delete', { ids }),
  /** Bulk void (same endpoint as bulk delete; payments are voided, never hard-deleted). */
  bulkVoid: (ids: string[]) => api.post('/payments-made/bulk-delete', { ids }),
};

export const vendorCreditsApi = {
  ...crud('/vendor-credits'),
  /** Applies the whole credit to a bill balance (no journal; AP was debited on creation). */
  applyToBill: (id: string, billId: string) =>
    api.post(`/vendor-credits/${id}/apply-to-bill`, { billId }),
  /** Posts Dr bank / Cr AP for the vendor's refund. */
  refund: (id: string, bankAccountId: string, date?: string) =>
    api.post(`/vendor-credits/${id}/refund`, { bankAccountId, date }),
  /** Voids an unapplied, unrefunded credit (posts a reversal journal). */
  void: (id: string) => api.delete(`/vendor-credits/${id}`),
  bulkDelete: (ids: string[]) => api.post('/vendor-credits/bulk-delete', { ids }),
  /** Accounts on a bill's lines: where its credit can be posted (purchases.create). */
  creditAccounts: (billId: string) =>
    api.get('/vendor-credits/credit-accounts', { params: { billId } }),
  /** Bank/cash accounts a refund can be received into (purchases.edit). */
  refundAccounts: () => api.get('/vendor-credits/refund-accounts'),
};

// ===========================================================================
// Inventory
// ===========================================================================

export const itemsApi = {
  ...crud('/items', { updateMethod: 'put' }),
};

export const warehousesApi = {
  ...crud('/warehouses', { hasCursor: false }),
  getStock: (id: string) => api.get(`/warehouses/${id}/stock`),
};

export const transfersApi = {
  ...crud('/transfers'),
  complete: (id: string) => api.patch(`/transfers/${id}/complete`),
  cancel: (id: string) => api.patch(`/transfers/${id}/cancel`),
  markInTransit: (id: string) => api.patch(`/transfers/${id}/in-transit`),
};

export const compositeItemsApi = {
  ...crud('/composite-items'),
  checkAvailability: (id: string, quantity?: number) =>
    api.get(`/composite-items/${id}/availability${quantity ? `?quantity=${quantity}` : ''}`),
  assemble: (id: string, data: { quantity: number; warehouseId: string }) =>
    api.post(`/composite-items/${id}/assemble`, data),
};

export const inventoryLevelsApi = {
  getAll: (params?: { itemId?: string; warehouseId?: string }) =>
    api.get('/inventory-levels', { params }),
  getByItem: (itemId: string) => api.get(`/inventory-levels/by-item/${itemId}`),
};

export const inventoryMovementsApi = {
  getAll: (params?: Record<string, unknown>) => api.get('/inventory-movements', { params }),
  getAllCursor: (params?: Record<string, unknown>) =>
    api.get('/inventory-movements/cursor', { params }),
};

export const adjustmentsApi = {
  ...crud('/inventory-adjustments', { hasCursor: false }),
  getAllCursor: (params?: Record<string, unknown>) =>
    api.get('/inventory-adjustments/cursor', { params }),
  void: (id: string) => api.post(`/inventory-adjustments/${id}/void`),
  accountOptions: () => api.get('/inventory-adjustments/account-options'),
};

// ===========================================================================
// Accounting
// ===========================================================================

export const accountsApi = {
  ...crud('/accounts'),
  getTree: () => api.get('/accounts/tree'),
  getByType: (type: string) => api.get(`/accounts/by-type/${type}`),
  seedDefaults: () => api.post('/accounts/seed-defaults'),
  seedByIndustry: (industry: string) => api.post(`/accounts/seed/${industry}`),
  getBalance: (id: string, params?: { asOfDate?: string }) =>
    api.get(`/accounts/${id}/balance`, { params }),
};

export const journalsApi = {
  ...crud('/journals'),
  post: (id: string) => api.post(`/journals/${id}/post`),
  /** Creates a posted, linked reversal of a posted journal (the original is never edited). */
  reverse: (id: string, data?: { date?: string }) =>
    api.post(`/journals/${id}/reverse`, data ?? {}),
  bulkDelete: (ids: string[]) => api.post('/journals/bulk-delete', { ids }),
  bulkPost: (ids: string[]) => api.post('/journals/bulk-post', { ids }),
};

export const recurringProfilesApi = {
  ...crud('/recurring-profiles', { hasCursor: false }),
  toggle: (id: string) => api.patch(`/recurring-profiles/${id}/toggle`),
  execute: (id: string, idempotencyKey: string) =>
    api.post(`/recurring-profiles/${id}/execute`, { idempotencyKey }),
  getStatistics: () => api.get('/recurring-profiles/statistics'),
  getExecutionHistory: (id: string, params?: { limit?: number }) =>
    api.get(`/recurring-profiles/${id}/executions`, { params }),
  getUpcoming: (days?: number) =>
    api.get(`/recurring-profiles/upcoming${days ? `?days=${days}` : ''}`),
};

// ===========================================================================
// Accounting Reports
// ===========================================================================

export const accountingReportsApi = {
  getTrialBalance: (params?: { asOfDate?: string }) =>
    api.get('/accounting-reports/trial-balance', { params }),
  getGeneralLedger: (accountId: string, params?: { dateFrom?: string; dateTo?: string }) =>
    api.get(`/accounting-reports/general-ledger/${accountId}`, { params }),
};

// ===========================================================================
// Projects
// ===========================================================================

export const projectsApi = {
  ...crud('/projects', { updateMethod: 'put', hasCursor: false }),
  getProfitability: (id: string) => api.get(`/projects/${id}/profitability`),
  bulkDelete: (ids: string[]) => api.post('/projects/bulk-delete', { ids }),
  bulkActivate: (ids: string[]) => api.post('/projects/bulk-activate', { ids }),
  bulkComplete: (ids: string[]) => api.post('/projects/bulk-complete', { ids }),
  bulkHold: (ids: string[]) => api.post('/projects/bulk-hold', { ids }),
  bulkCancel: (ids: string[]) => api.post('/projects/bulk-cancel', { ids }),
};

export const timesheetsApi = {
  ...crud('/timesheets', { updateMethod: 'put', hasCursor: false }),
  startTimer: (data: Record<string, unknown>) => api.post('/timesheets/timer/start', data),
  stopTimer: (id: string) => api.post(`/timesheets/timer/stop/${id}`),
  getRunningTimer: () => api.get('/timesheets/timer/running'),
  getWeeklySummary: (weekStart: string) =>
    api.get(`/timesheets/weekly-summary?weekStart=${weekStart}`),
};

// ===========================================================================
// Reports (no CRUD pattern)
// ===========================================================================

export const reportsApi = {
  getProfitAndLoss: (startDate: string, endDate: string) =>
    api.get(`/reports/profit-and-loss?startDate=${startDate}&endDate=${endDate}`),
  getBalanceSheet: (asOfDate: string) => api.get(`/reports/balance-sheet?asOfDate=${asOfDate}`),
  getCashFlow: (startDate: string, endDate: string) =>
    api.get(`/reports/cash-flow?startDate=${startDate}&endDate=${endDate}`),
  getTrialBalance: (asOfDate: string) => api.get(`/reports/trial-balance?asOfDate=${asOfDate}`),
  getReceivablesAging: (asOfDate?: string) =>
    api.get(`/reports/receivables-aging${asOfDate ? `?asOfDate=${asOfDate}` : ''}`),
  getPayablesAging: (asOfDate?: string) =>
    api.get(`/reports/payables-aging${asOfDate ? `?asOfDate=${asOfDate}` : ''}`),
};

// ===========================================================================
// AI (no CRUD pattern)
// ===========================================================================

export const aiApi = {
  getInsights: () => api.get('/ai/insights'),
  forecastRevenue: (months?: number) =>
    api.get(`/ai/forecast/revenue${months ? `?months=${months}` : ''}`),
  forecastCashFlow: (weeks?: number) =>
    api.get(`/ai/forecast/cash-flow${weeks ? `?weeks=${weeks}` : ''}`),
  predictChurn: () => api.get('/ai/forecast/customer-churn'),
  categorize: (data: { description: string; amount: number; type: 'expense' | 'income' }) =>
    api.post('/ai/categorize', data),
};

// ===========================================================================
// Notifications
// ===========================================================================

export const notificationsApi = {
  getAll: (params?: Record<string, unknown>) => api.get('/notifications', { params }),
  getUnreadCount: () => api.get('/notifications/unread-count'),
  markAsRead: (id: string) => api.post(`/notifications/${id}/read`),
  markAllAsRead: () => api.post('/notifications/read-all'),
};

// ===========================================================================
// Admin: Roles & Users
// ===========================================================================

export const rolesApi = {
  ...crud('/roles', { hasCursor: false }),
  seedDefaults: () => api.post('/roles/seed-defaults'),
  assignRole: (data: { userId: string; roleId: string }) => api.post('/roles/assign', data),
};

export const usersApi = {
  ...crud('/users', { hasCursor: false }),
};

// ===========================================================================
// Audit Logs (read-only)
// ===========================================================================

export const auditLogsApi = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getAll: (params?: Record<string, any>) => api.get('/audit-logs', { params }),
  getOne: (id: string) => api.get(`/audit-logs/${id}`),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getByEntity: (entityType: string, entityId: string, params?: Record<string, any>) =>
    api.get(`/audit-logs/entity/${entityType}/${entityId}`, { params }),
  getStats: (days?: number) => api.get(`/audit-logs/stats${days ? `?days=${days}` : ''}`),
};

// ===========================================================================
// Tax
// ===========================================================================

export const taxRatesApi = {
  ...crud('/tax-rates', { hasCursor: false }),
};

export const vatReturnsApi = {
  getAll: (params?: Record<string, unknown>) => api.get('/vat-returns', { params }),
  getOne: (id: string) => api.get(`/vat-returns/${id}`),
  generate: (startDate: string, endDate: string) =>
    api.post('/vat-returns', { startDate, endDate }),
  submit: (id: string) => api.post(`/vat-returns/${id}/submit`),
  delete: (id: string) => api.delete(`/vat-returns/${id}`),
  recordPayment: (id: string, data: Record<string, unknown>) =>
    api.post(`/vat-returns/${id}/payment`, data),
  bulkDelete: (ids: string[]) => api.post('/vat-returns/bulk-delete', { ids }),
  bulkSubmit: (ids: string[]) => api.post('/vat-returns/bulk-submit', { ids }),
};

// ===========================================================================
// Banking
// ===========================================================================

export const bankAccountsApi = {
  ...crud('/bank-accounts', { hasCursor: false }),
  getTransactions: (id: string, params?: Record<string, unknown>) =>
    api.get(`/bank-accounts/${id}/transactions`, { params }),
  getReconciliation: (id: string) => api.get(`/bank-accounts/${id}/reconciliation`),
  getStats: () => api.get('/bank-accounts/stats'),
  getBalanceHistory: (id: string) => api.get(`/bank-accounts/${id}/balance-history`),
};

export const bankTransactionsApi = {
  ...crud('/bank-transactions'),
  getUnmatched: (bankAccountId: string) =>
    api.get('/bank-transactions/unmatched', { params: { bankAccountId } }),
  getSuggestedMatches: (id: string) => api.get(`/bank-transactions/${id}/suggested-matches`),
  match: (id: string, data: { documentId: string; documentType: string }) =>
    api.post(`/bank-transactions/${id}/match`, data),
  unmatch: (id: string) => api.post(`/bank-transactions/${id}/unmatch`),
  exclude: (id: string) => api.post(`/bank-transactions/${id}/exclude`),
  createExpense: (id: string, data: Record<string, unknown>) =>
    api.post(`/bank-transactions/${id}/create-expense`, data),
  createTransfer: (id: string, data: Record<string, unknown>) =>
    api.post(`/bank-transactions/${id}/create-transfer`, data),
  import: (bankAccountId: string, data: FormData) => {
    data.append('bankAccountId', bankAccountId);
    return api.post('/bank-transactions/import-statement', data, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
};

export const bankRulesApi = {
  ...crud('/bank-rules', { hasCursor: false }),
  test: (data: Record<string, unknown>) => api.post('/bank-rules/test', data),
  reorder: (ids: string[]) => api.post('/bank-rules/reorder', { ids }),
};

// ===========================================================================
// HR
// ===========================================================================

export const employeesApi = {
  ...crud('/employees'),
};

export const attendanceApi = {
  getAll: (params?: Record<string, unknown>) => api.get('/attendance', { params }),
  mark: (data: Record<string, unknown>) => api.post('/attendance', data),
  markBulk: (data: Record<string, unknown>) => api.post('/attendance/bulk', data),
  update: (id: string, data: Record<string, unknown>) => api.patch(`/attendance/${id}`, data),
};

export const payrollApi = {
  getAll: (params?: Record<string, unknown>) => api.get('/payroll/runs', { params }),
  getOne: (id: string) => api.get(`/payroll/runs/${id}`),
  run: (data: { month: number; year: number }) => api.post('/payroll/runs', data),
  confirm: (id: string) => api.post(`/payroll/runs/${id}/calculate`),
  markPaid: (id: string) => api.post(`/payroll/runs/${id}/paid`),
  getPayslip: (_payrollId: string, payslipId: string) => api.get(`/payroll/payslips/${payslipId}`),
  bulkDelete: (ids: string[]) => api.post('/payroll/runs/bulk-delete', { ids }),
  bulkProcess: (ids: string[]) => api.post('/payroll/runs/bulk-process', { ids }),
  bulkPay: (ids: string[]) => api.post('/payroll/runs/bulk-pay', { ids }),
};

export const departmentsApi = {
  getAll: () => api.get('/departments'),
};

// ===========================================================================
// Manufacturing
// ===========================================================================

export const workOrdersApi = {
  ...crud('/work-orders', { updateMethod: 'put', hasCursor: false }),
  start: (id: string) => api.post(`/work-orders/${id}/start`),
  complete: (id: string, data: Record<string, unknown>) =>
    api.post(`/work-orders/${id}/complete`, data),
  cancel: (id: string, data: Record<string, unknown>) =>
    api.post(`/work-orders/${id}/cancel`, data),
  bulkDelete: (ids: string[]) => api.post('/work-orders/bulk-delete', { ids }),
  bulkStart: (ids: string[]) => api.post('/work-orders/bulk-start', { ids }),
  bulkComplete: (ids: string[]) => api.post('/work-orders/bulk-complete', { ids }),
  bulkCancel: (ids: string[]) => api.post('/work-orders/bulk-cancel', { ids }),
};

// ===========================================================================
// Performance / Database Monitoring (no CRUD pattern)
// ===========================================================================

export const performanceApi = {
  getSlowQueries: (params?: Record<string, unknown>) =>
    api.get('/performance/slow-queries', { params }),
  getStats: () => api.get('/performance/stats'),
  getDistribution: () => api.get('/performance/distribution'),
  getTrend: (interval?: number) => api.get('/performance/trend', { params: { interval } }),
  getHealth: () => api.get('/performance/health'),
  getIndexRecommendations: () => api.get('/performance/index-recommendations'),
  resetMetrics: () => api.post('/performance/reset'),
};

// ===========================================================================
// Global Search
// ===========================================================================

export interface GlobalSearchParams {
  q: string;
  limit?: number;
  types?: string[];
  fuzzyThreshold?: number;
}

export interface RecordSearchHistoryData {
  query: string;
  resultType?: string;
  resultId?: string;
  resultTitle?: string;
}

export const searchApi = {
  search: (params: GlobalSearchParams) => api.get('/search', { params }),
  getHistory: () => api.get('/search/history'),
  recordHistory: (data: RecordSearchHistoryData) => api.post('/search/history', data),
  clearHistory: () => api.delete('/search/history'),
};

// ===========================================================================
// Cache Admin
// ===========================================================================

export interface CacheStats {
  storeType: 'redis' | 'memory';
  connected: boolean;
  keyCount: number;
  memoryUsage: string;
  uptime: number;
  hitRate: number;
}

export interface CacheKeyInfo {
  key: string;
  ttl: number;
}

export interface CacheKeysResponse {
  keys: CacheKeyInfo[];
  nextCursor: string;
}

export interface FlushCacheResponse {
  success: boolean;
  keysRemoved: number;
}

export interface DeletePatternResponse {
  success: boolean;
  keysDeleted: number;
  pattern: string;
}

export const cacheApi = {
  getStats: () => api.get<CacheStats>('/cache/stats'),
  getKeys: (cursor?: string, count?: number) =>
    api.get<CacheKeysResponse>('/cache/keys', {
      params: { cursor, count },
    }),
  flush: () => api.delete<FlushCacheResponse>('/cache/flush'),
  deletePattern: (pattern: string) =>
    api.delete<DeletePatternResponse>(`/cache/keys/${encodeURIComponent(pattern)}`),
};

// ===========================================================================
// Bulk Export
// ===========================================================================

export const bulkExportApi = {
  export: (ids: string[], entityType: string, format: 'csv' | 'xlsx' = 'csv') =>
    api.post('/export/bulk', { ids, entityType, format }, { responseType: 'blob' }),
};

// Export main api for direct usage
export { api };
