import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { getSession, signOut } from 'next-auth/react';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:6001/api';

// --- Session caching (with in-flight deduplication) ---
let cachedSession: any = null;
let sessionCacheTimestamp = 0;
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

// --- Refresh queue ---
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (token: string) => void;
  reject: (error: any) => void;
}> = [];

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

// --- Redirect deduplication ---
let isRedirecting = false;

function redirectToLogin() {
  if (isRedirecting) return;
  isRedirecting = true;
  if (typeof window !== 'undefined') {
    // Clear cached session immediately so no stale tokens are used
    invalidateSessionCache();
    // signOut() clears the NextAuth session cookie then redirects to /login
    signOut({ callbackUrl: '/login' });
  }
}

// Public API client for auth endpoints (no session interceptor)
const publicApi = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Authenticated API client (with session interceptor)
const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
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

    // Only handle 401 on client side, and don't retry already-retried requests
    if (typeof window === 'undefined' || error.response?.status !== 401 || originalRequest._retry) {
      return Promise.reject(error);
    }

    // If already refreshing, queue this request to retry after refresh completes
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
      // Invalidate cache and get fresh session (triggers NextAuth JWT callback refresh)
      invalidateSessionCache();
      const newSession = await getSession();

      if (!newSession?.accessToken || newSession.error === 'RefreshAccessTokenError') {
        processQueue(new Error('Refresh failed'), null);
        redirectToLogin();
        return Promise.reject(error);
      }

      // Update cache with fresh session
      cachedSession = newSession;
      sessionCacheTimestamp = Date.now();

      const newToken = newSession.accessToken;
      processQueue(null, newToken);

      // Retry the original request with new token
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

// Auth API - uses publicApi to avoid session interceptor issues during login/register
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

// Dashboard API
export const dashboardApi = {
  getOverview: () => api.get('/reports/dashboard'),
  getRevenueChart: (months?: number) =>
    api.get(`/reports/dashboard/revenue-chart${months ? `?months=${months}` : ''}`),
  getCashFlowChart: (days?: number) =>
    api.get(`/reports/dashboard/cash-flow-chart${days ? `?days=${days}` : ''}`),
  getTopCustomers: (limit?: number) =>
    api.get(`/reports/dashboard/top-customers${limit ? `?limit=${limit}` : ''}`),
};

// Customers API
export const customersApi = {
  getAll: (params?: Record<string, any>) => api.get('/customers', { params }),
  getAllCursor: (params?: Record<string, unknown>) => api.get('/customers/cursor', { params }),
  getOne: (id: string) => api.get(`/customers/${id}`),
  getStatement: (id: string, params?: Record<string, any>) =>
    api.get(`/customers/${id}/statement`, { params }),
  create: (data: any) => api.post('/customers', data),
  update: (id: string, data: any) => api.patch(`/customers/${id}`, data),
  delete: (id: string) => api.delete(`/customers/${id}`),
};

// Quotes API
export const quotesApi = {
  getAll: (params?: Record<string, any>) => api.get('/quotes', { params }),
  getAllCursor: (params?: Record<string, unknown>) => api.get('/quotes/cursor', { params }),
  getOne: (id: string) => api.get(`/quotes/${id}`),
  create: (data: any) => api.post('/quotes', data),
  update: (id: string, data: any) => api.patch(`/quotes/${id}`, data),
  delete: (id: string) => api.delete(`/quotes/${id}`),
  send: (id: string) => api.patch(`/quotes/${id}/send`),
  accept: (id: string) => api.patch(`/quotes/${id}/accept`),
  decline: (id: string) => api.patch(`/quotes/${id}/decline`),
  convertToInvoice: (id: string) => api.post(`/quotes/${id}/convert-to-invoice`),
  // Bulk operations
  bulkDelete: (ids: string[]) => api.post('/quotes/bulk-delete', { ids }),
  bulkSend: (ids: string[]) => api.post('/quotes/bulk-send', { ids }),
  bulkDecline: (ids: string[]) => api.post('/quotes/bulk-decline', { ids }),
};

// Invoices API
export const invoicesApi = {
  getAll: (params?: Record<string, any>) => api.get('/invoices', { params }),
  getAllCursor: (params?: Record<string, unknown>) => api.get('/invoices/cursor', { params }),
  getOne: (id: string) => api.get(`/invoices/${id}`),
  create: (data: any) => api.post('/invoices', data),
  update: (id: string, data: any) => api.patch(`/invoices/${id}`, data),
  delete: (id: string) => api.delete(`/invoices/${id}`),
  send: (id: string) => api.patch(`/invoices/${id}/send`),
  void: (id: string) => api.patch(`/invoices/${id}/void`),
  // Bulk operations
  bulkDelete: (ids: string[]) => api.post('/invoices/bulk-delete', { ids }),
  bulkSend: (ids: string[]) => api.post('/invoices/bulk-send', { ids }),
  bulkVoid: (ids: string[]) => api.post('/invoices/bulk-void', { ids }),
  bulkPay: (ids: string[]) => api.post('/invoices/bulk-pay', { ids }),
};

// Credit Notes API
export const creditNotesApi = {
  getAll: (params?: Record<string, any>) => api.get('/credit-notes', { params }),
  getAllCursor: (params?: Record<string, unknown>) => api.get('/credit-notes/cursor', { params }),
  getOne: (id: string) => api.get(`/credit-notes/${id}`),
  create: (data: any) => api.post('/credit-notes', data),
};

// Payments Received API
export const paymentsReceivedApi = {
  getAll: (params?: Record<string, any>) => api.get('/payments-received', { params }),
  getAllCursor: (params?: Record<string, unknown>) =>
    api.get('/payments-received/cursor', { params }),
  getOne: (id: string) => api.get(`/payments-received/${id}`),
  create: (data: any) => api.post('/payments-received', data),
};

// Vendors API
export const vendorsApi = {
  getAll: (params?: Record<string, any>) => api.get('/vendors', { params }),
  getAllCursor: (params?: Record<string, unknown>) => api.get('/vendors/cursor', { params }),
  getOne: (id: string) => api.get(`/vendors/${id}`),
  create: (data: any) => api.post('/vendors', data),
  update: (id: string, data: any) => api.patch(`/vendors/${id}`, data),
  delete: (id: string) => api.delete(`/vendors/${id}`),
};

// Expenses API
export const expensesApi = {
  getAll: (params?: Record<string, any>) => api.get('/expenses', { params }),
  getAllCursor: (params?: Record<string, unknown>) => api.get('/expenses/cursor', { params }),
  getOne: (id: string) => api.get(`/expenses/${id}`),
  create: (data: any) => api.post('/expenses', data),
  update: (id: string, data: any) => api.patch(`/expenses/${id}`, data),
  delete: (id: string) => api.delete(`/expenses/${id}`),
  // Bulk operations
  bulkDelete: (ids: string[]) => api.post('/expenses/bulk-delete', { ids }),
  bulkCategorize: (ids: string[], accountId: string) =>
    api.post('/expenses/bulk-categorize', { ids, accountId }),
  bulkApprove: (ids: string[]) => api.post('/expenses/bulk-approve', { ids }),
};

// Bills API
export const billsApi = {
  getAll: (params?: Record<string, any>) => api.get('/bills', { params }),
  getAllCursor: (params?: Record<string, unknown>) => api.get('/bills/cursor', { params }),
  getOne: (id: string) => api.get(`/bills/${id}`),
  create: (data: any) => api.post('/bills', data),
  update: (id: string, data: any) => api.patch(`/bills/${id}`, data),
  delete: (id: string) => api.delete(`/bills/${id}`),
  open: (id: string) => api.patch(`/bills/${id}/open`),
  // Bulk operations
  bulkDelete: (ids: string[]) => api.post('/bills/bulk-delete', { ids }),
  bulkOpen: (ids: string[]) => api.post('/bills/bulk-open', { ids }),
  bulkApprove: (ids: string[]) => api.post('/bills/bulk-approve', { ids }),
  bulkPay: (ids: string[]) => api.post('/bills/bulk-pay', { ids }),
};

// Payments Made API
export const paymentsMadeApi = {
  getAll: (params?: Record<string, any>) => api.get('/payments-made', { params }),
  getAllCursor: (params?: Record<string, unknown>) => api.get('/payments-made/cursor', { params }),
  getOne: (id: string) => api.get(`/payments-made/${id}`),
  create: (data: any) => api.post('/payments-made', data),
  delete: (id: string) => api.delete(`/payments-made/${id}`),
};

// Vendor Credits API
export const vendorCreditsApi = {
  getAll: (params?: Record<string, any>) => api.get('/vendor-credits', { params }),
  getAllCursor: (params?: Record<string, unknown>) => api.get('/vendor-credits/cursor', { params }),
  getOne: (id: string) => api.get(`/vendor-credits/${id}`),
  create: (data: any) => api.post('/vendor-credits', data),
  applyToBill: (id: string, billId: string) => api.patch(`/vendor-credits/${id}/apply`, { billId }),
  refund: (id: string, bankAccountId: string) =>
    api.patch(`/vendor-credits/${id}/refund`, { bankAccountId }),
};

// Items API
export const itemsApi = {
  getAll: (params?: Record<string, any>) => api.get('/items', { params }),
  getAllCursor: (params?: Record<string, unknown>) => api.get('/items/cursor', { params }),
  getOne: (id: string) => api.get(`/items/${id}`),
  create: (data: any) => api.post('/items', data),
  update: (id: string, data: any) => api.put(`/items/${id}`, data),
  delete: (id: string) => api.delete(`/items/${id}`),
};

// Accounts API
export const accountsApi = {
  getAll: (params?: Record<string, any>) => api.get('/accounts', { params }),
  getAllCursor: (params?: Record<string, unknown>) => api.get('/accounts/cursor', { params }),
  getTree: () => api.get('/accounts/tree'),
  getByType: (type: string) => api.get(`/accounts/by-type/${type}`),
  getOne: (id: string) => api.get(`/accounts/${id}`),
  create: (data: any) => api.post('/accounts', data),
  update: (id: string, data: any) => api.patch(`/accounts/${id}`, data),
  delete: (id: string) => api.delete(`/accounts/${id}`),
  seedDefaults: () => api.post('/accounts/seed-defaults'),
  seedByIndustry: (industry: string) => api.post(`/accounts/seed/${industry}`),
};

// Journals API
export const journalsApi = {
  getAll: (params?: Record<string, any>) => api.get('/journals', { params }),
  getAllCursor: (params?: Record<string, unknown>) => api.get('/journals/cursor', { params }),
  getOne: (id: string) => api.get(`/journals/${id}`),
  create: (data: any) => api.post('/journals', data),
  update: (id: string, data: any) => api.patch(`/journals/${id}`, data),
  delete: (id: string) => api.delete(`/journals/${id}`),
  post: (id: string) => api.post(`/journals/${id}/post`),
  // Bulk operations
  bulkDelete: (ids: string[]) => api.post('/journals/bulk-delete', { ids }),
  bulkPost: (ids: string[]) => api.post('/journals/bulk-post', { ids }),
};

// Recurring Profiles API
export const recurringProfilesApi = {
  getAll: (params?: Record<string, any>) => api.get('/recurring-profiles', { params }),
  getOne: (id: string) => api.get(`/recurring-profiles/${id}`),
  create: (data: any) => api.post('/recurring-profiles', data),
  update: (id: string, data: any) => api.patch(`/recurring-profiles/${id}`, data),
  toggle: (id: string) => api.patch(`/recurring-profiles/${id}/toggle`),
  delete: (id: string) => api.delete(`/recurring-profiles/${id}`),
};

// Projects API
export const projectsApi = {
  getAll: (params?: Record<string, any>) => api.get('/projects', { params }),
  getOne: (id: string) => api.get(`/projects/${id}`),
  create: (data: any) => api.post('/projects', data),
  update: (id: string, data: any) => api.put(`/projects/${id}`, data),
  delete: (id: string) => api.delete(`/projects/${id}`),
  getProfitability: (id: string) => api.get(`/projects/${id}/profitability`),
  // Bulk operations
  bulkDelete: (ids: string[]) => api.post('/projects/bulk-delete', { ids }),
  bulkActivate: (ids: string[]) => api.post('/projects/bulk-activate', { ids }),
  bulkComplete: (ids: string[]) => api.post('/projects/bulk-complete', { ids }),
  bulkHold: (ids: string[]) => api.post('/projects/bulk-hold', { ids }),
  bulkCancel: (ids: string[]) => api.post('/projects/bulk-cancel', { ids }),
};

// Timesheets API
export const timesheetsApi = {
  getAll: (params?: Record<string, any>) => api.get('/timesheets', { params }),
  create: (data: any) => api.post('/timesheets', data),
  update: (id: string, data: any) => api.put(`/timesheets/${id}`, data),
  delete: (id: string) => api.delete(`/timesheets/${id}`),
  startTimer: (data: any) => api.post('/timesheets/timer/start', data),
  stopTimer: (id: string) => api.post(`/timesheets/timer/stop/${id}`),
  getRunningTimer: () => api.get('/timesheets/timer/running'),
  getWeeklySummary: (weekStart: string) =>
    api.get(`/timesheets/weekly-summary?weekStart=${weekStart}`),
};

// Reports API
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

// AI API
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

// Notifications API
export const notificationsApi = {
  getAll: (params?: Record<string, any>) => api.get('/notifications', { params }),
  getUnreadCount: () => api.get('/notifications/unread-count'),
  markAsRead: (id: string) => api.post(`/notifications/${id}/read`),
  markAllAsRead: () => api.post('/notifications/read-all'),
};

// Roles API
export const rolesApi = {
  getAll: (params?: Record<string, any>) => api.get('/roles', { params }),
  getOne: (id: string) => api.get(`/roles/${id}`),
  create: (data: any) => api.post('/roles', data),
  update: (id: string, data: any) => api.patch(`/roles/${id}`, data),
  delete: (id: string) => api.delete(`/roles/${id}`),
  seedDefaults: () => api.post('/roles/seed-defaults'),
  assignRole: (data: { userId: string; roleId: string }) => api.post('/roles/assign', data),
};

// Users API
export const usersApi = {
  getAll: (params?: Record<string, any>) => api.get('/users', { params }),
  getOne: (id: string) => api.get(`/users/${id}`),
  create: (data: any) => api.post('/users', data),
  update: (id: string, data: any) => api.patch(`/users/${id}`, data),
  delete: (id: string) => api.delete(`/users/${id}`),
};

// Audit Logs API
export const auditLogsApi = {
  getAll: (params?: Record<string, any>) => api.get('/audit-logs', { params }),
  getOne: (id: string) => api.get(`/audit-logs/${id}`),
  getByEntity: (entityType: string, entityId: string, params?: Record<string, any>) =>
    api.get(`/audit-logs/entity/${entityType}/${entityId}`, { params }),
  getStats: (days?: number) => api.get(`/audit-logs/stats${days ? `?days=${days}` : ''}`),
};

// Tax Rates API
export const taxRatesApi = {
  getAll: (params?: Record<string, any>) => api.get('/tax-rates', { params }),
  getOne: (id: string) => api.get(`/tax-rates/${id}`),
  create: (data: any) => api.post('/tax-rates', data),
  update: (id: string, data: any) => api.patch(`/tax-rates/${id}`, data),
  delete: (id: string) => api.delete(`/tax-rates/${id}`),
};

// Warehouses API
export const warehousesApi = {
  getAll: (params?: Record<string, any>) => api.get('/warehouses', { params }),
  getOne: (id: string) => api.get(`/warehouses/${id}`),
  getStock: (id: string) => api.get(`/warehouses/${id}/stock`),
  create: (data: any) => api.post('/warehouses', data),
  update: (id: string, data: any) => api.patch(`/warehouses/${id}`, data),
  delete: (id: string) => api.delete(`/warehouses/${id}`),
};

// Transfers API
export const transfersApi = {
  getAll: (params?: Record<string, any>) => api.get('/transfers', { params }),
  getAllCursor: (params?: Record<string, unknown>) => api.get('/transfers/cursor', { params }),
  getOne: (id: string) => api.get(`/transfers/${id}`),
  create: (data: any) => api.post('/transfers', data),
  complete: (id: string) => api.patch(`/transfers/${id}/complete`),
  cancel: (id: string) => api.patch(`/transfers/${id}/cancel`),
};

// Adjustments API
export const adjustmentsApi = {
  getAll: (params?: Record<string, any>) => api.get('/adjustments', { params }),
  getAllCursor: (params?: Record<string, unknown>) =>
    api.get('/inventory-adjustments/cursor', { params }),
  getOne: (id: string) => api.get(`/adjustments/${id}`),
  create: (data: any) => api.post('/adjustments', data),
  post: (id: string) => api.patch(`/adjustments/${id}/post`),
  delete: (id: string) => api.delete(`/adjustments/${id}`),
};

// Work Orders API
export const workOrdersApi = {
  getAll: (params?: Record<string, any>) => api.get('/work-orders', { params }),
  getOne: (id: string) => api.get(`/work-orders/${id}`),
  create: (data: any) => api.post('/work-orders', data),
  update: (id: string, data: any) => api.put(`/work-orders/${id}`, data),
  delete: (id: string) => api.delete(`/work-orders/${id}`),
  start: (id: string) => api.post(`/work-orders/${id}/start`),
  complete: (id: string, data: any) => api.post(`/work-orders/${id}/complete`, data),
  cancel: (id: string, data: any) => api.post(`/work-orders/${id}/cancel`, data),
  // Bulk operations
  bulkDelete: (ids: string[]) => api.post('/work-orders/bulk-delete', { ids }),
  bulkStart: (ids: string[]) => api.post('/work-orders/bulk-start', { ids }),
  bulkComplete: (ids: string[]) => api.post('/work-orders/bulk-complete', { ids }),
  bulkCancel: (ids: string[]) => api.post('/work-orders/bulk-cancel', { ids }),
};

// Bank Accounts API
export const bankAccountsApi = {
  getAll: (params?: Record<string, any>) => api.get('/bank-accounts', { params }),
  getOne: (id: string) => api.get(`/bank-accounts/${id}`),
  create: (data: any) => api.post('/bank-accounts', data),
  update: (id: string, data: any) => api.patch(`/bank-accounts/${id}`, data),
  delete: (id: string) => api.delete(`/bank-accounts/${id}`),
  getTransactions: (id: string, params?: any) =>
    api.get(`/bank-accounts/${id}/transactions`, { params }),
  getReconciliation: (id: string) => api.get(`/bank-accounts/${id}/reconciliation`),
};

// Bank Transactions API
export const bankTransactionsApi = {
  getAll: (params?: Record<string, any>) => api.get('/bank-transactions', { params }),
  getAllCursor: (params?: Record<string, unknown>) =>
    api.get('/bank-transactions/cursor', { params }),
  getOne: (id: string) => api.get(`/bank-transactions/${id}`),
  getUnmatched: (bankAccountId: string) =>
    api.get('/bank-transactions/unmatched', { params: { bankAccountId } }),
  getSuggestedMatches: (id: string) => api.get(`/bank-transactions/${id}/suggested-matches`),
  match: (id: string, data: { documentId: string; documentType: string }) =>
    api.post(`/bank-transactions/${id}/match`, data),
  unmatch: (id: string) => api.post(`/bank-transactions/${id}/unmatch`),
  exclude: (id: string) => api.post(`/bank-transactions/${id}/exclude`),
  createExpense: (id: string, data: any) =>
    api.post(`/bank-transactions/${id}/create-expense`, data),
  createTransfer: (id: string, data: any) =>
    api.post(`/bank-transactions/${id}/create-transfer`, data),
  import: (bankAccountId: string, data: FormData) =>
    api.post(`/bank-transactions/import/${bankAccountId}`, data, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
};

// Bank Rules API
export const bankRulesApi = {
  getAll: (params?: Record<string, any>) => api.get('/bank-rules', { params }),
  getOne: (id: string) => api.get(`/bank-rules/${id}`),
  create: (data: any) => api.post('/bank-rules', data),
  update: (id: string, data: any) => api.patch(`/bank-rules/${id}`, data),
  delete: (id: string) => api.delete(`/bank-rules/${id}`),
  test: (data: any) => api.post('/bank-rules/test', data),
  reorder: (ids: string[]) => api.post('/bank-rules/reorder', { ids }),
};

// Employees API
export const employeesApi = {
  getAll: (params?: any) => api.get('/employees', { params }),
  getAllCursor: (params?: Record<string, unknown>) => api.get('/employees/cursor', { params }),
  getOne: (id: string) => api.get(`/employees/${id}`),
  create: (data: any) => api.post('/employees', data),
  update: (id: string, data: any) => api.patch(`/employees/${id}`, data),
  delete: (id: string) => api.delete(`/employees/${id}`),
};

// Attendance API
export const attendanceApi = {
  getAll: (params?: any) => api.get('/attendance', { params }),
  mark: (data: any) => api.post('/attendance', data),
  markBulk: (data: any) => api.post('/attendance/bulk', data),
  update: (id: string, data: any) => api.patch(`/attendance/${id}`, data),
};

// Payroll API
export const payrollApi = {
  getAll: (params?: any) => api.get('/payroll', { params }),
  getOne: (id: string) => api.get(`/payroll/${id}`),
  run: (data: { month: number; year: number }) => api.post('/payroll/run', data),
  confirm: (id: string) => api.post(`/payroll/${id}/confirm`),
  markPaid: (id: string) => api.post(`/payroll/${id}/mark-paid`),
  getPayslip: (payrollId: string, payslipId: string) =>
    api.get(`/payroll/${payrollId}/payslips/${payslipId}`),
  // Bulk operations
  bulkDelete: (ids: string[]) => api.post('/payroll/runs/bulk-delete', { ids }),
  bulkProcess: (ids: string[]) => api.post('/payroll/runs/bulk-process', { ids }),
  bulkPay: (ids: string[]) => api.post('/payroll/runs/bulk-pay', { ids }),
};

// Departments API
export const departmentsApi = {
  getAll: () => api.get('/departments'),
};

// VAT Returns API
export const vatReturnsApi = {
  getAll: (params?: Record<string, any>) => api.get('/vat-returns', { params }),
  getOne: (id: string) => api.get(`/vat-returns/${id}`),
  generate: (startDate: string, endDate: string) =>
    api.post('/vat-returns', { startDate, endDate }),
  submit: (id: string) => api.post(`/vat-returns/${id}/submit`),
  delete: (id: string) => api.delete(`/vat-returns/${id}`),
  recordPayment: (id: string, data: any) => api.post(`/vat-returns/${id}/payment`, data),
  // Bulk operations
  bulkDelete: (ids: string[]) => api.post('/vat-returns/bulk-delete', { ids }),
  bulkSubmit: (ids: string[]) => api.post('/vat-returns/bulk-submit', { ids }),
};

// Performance / Database Monitoring API
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

// Global Search API
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

// Cache Admin API
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

// Export main api for direct usage
export { api };

// Bulk Export API
export const bulkExportApi = {
  export: (ids: string[], entityType: string, format: 'csv' | 'xlsx' = 'csv') =>
    api.post('/export/bulk', { ids, entityType, format }, { responseType: 'blob' }),
};
