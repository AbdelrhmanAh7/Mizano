import axios from 'axios';
import { getSession } from 'next-auth/react';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api';

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

api.interceptors.request.use(async (config) => {
  // Only run on client side
  if (typeof window !== 'undefined') {
    const session = await getSession();
    if (session?.accessToken) {
      config.headers.Authorization = `Bearer ${session.accessToken}`;
    }
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (typeof window !== 'undefined' && error.response?.status === 401) {
      // Handle token refresh or redirect to login
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;

// Auth API - uses publicApi to avoid session interceptor issues during login/register
export const authApi = {
  login: (email: string, password: string) =>
    publicApi.post('/auth/login', { email, password }),
  register: (data: { email: string; password: string; firstName: string; lastName: string; organizationName: string }) =>
    publicApi.post('/auth/register', data),
  refreshToken: (refreshToken: string) =>
    publicApi.post('/auth/refresh', { refreshToken }),
};

// Dashboard API
export const dashboardApi = {
  getOverview: () => api.get('/reports/dashboard'),
  getRevenueChart: (months?: number) => api.get(`/reports/dashboard/revenue-chart${months ? `?months=${months}` : ''}`),
  getCashFlowChart: (days?: number) => api.get(`/reports/dashboard/cash-flow-chart${days ? `?days=${days}` : ''}`),
  getTopCustomers: (limit?: number) => api.get(`/reports/dashboard/top-customers${limit ? `?limit=${limit}` : ''}`),
};

// Customers API
export const customersApi = {
  getAll: (params?: Record<string, any>) => api.get('/customers', { params }),
  getOne: (id: string) => api.get(`/customers/${id}`),
  getStatement: (id: string, params?: Record<string, any>) => api.get(`/customers/${id}/statement`, { params }),
  create: (data: any) => api.post('/customers', data),
  update: (id: string, data: any) => api.patch(`/customers/${id}`, data),
  delete: (id: string) => api.delete(`/customers/${id}`),
};

// Quotes API
export const quotesApi = {
  getAll: (params?: Record<string, any>) => api.get('/quotes', { params }),
  getOne: (id: string) => api.get(`/quotes/${id}`),
  create: (data: any) => api.post('/quotes', data),
  update: (id: string, data: any) => api.patch(`/quotes/${id}`, data),
  delete: (id: string) => api.delete(`/quotes/${id}`),
  send: (id: string) => api.patch(`/quotes/${id}/send`),
  accept: (id: string) => api.patch(`/quotes/${id}/accept`),
  decline: (id: string) => api.patch(`/quotes/${id}/decline`),
  convertToInvoice: (id: string) => api.post(`/quotes/${id}/convert-to-invoice`),
};

// Invoices API
export const invoicesApi = {
  getAll: (params?: Record<string, any>) => api.get('/invoices', { params }),
  getOne: (id: string) => api.get(`/invoices/${id}`),
  create: (data: any) => api.post('/invoices', data),
  update: (id: string, data: any) => api.patch(`/invoices/${id}`, data),
  delete: (id: string) => api.delete(`/invoices/${id}`),
  send: (id: string) => api.patch(`/invoices/${id}/send`),
  void: (id: string) => api.patch(`/invoices/${id}/void`),
};

// Credit Notes API
export const creditNotesApi = {
  getAll: (params?: Record<string, any>) => api.get('/credit-notes', { params }),
  getOne: (id: string) => api.get(`/credit-notes/${id}`),
  create: (data: any) => api.post('/credit-notes', data),
};

// Payments Received API
export const paymentsReceivedApi = {
  getAll: (params?: Record<string, any>) => api.get('/payments-received', { params }),
  getOne: (id: string) => api.get(`/payments-received/${id}`),
  create: (data: any) => api.post('/payments-received', data),
};

// Vendors API
export const vendorsApi = {
  getAll: (params?: Record<string, any>) => api.get('/vendors', { params }),
  getOne: (id: string) => api.get(`/vendors/${id}`),
  create: (data: any) => api.post('/vendors', data),
  update: (id: string, data: any) => api.patch(`/vendors/${id}`, data),
  delete: (id: string) => api.delete(`/vendors/${id}`),
};

// Expenses API
export const expensesApi = {
  getAll: (params?: Record<string, any>) => api.get('/expenses', { params }),
  getOne: (id: string) => api.get(`/expenses/${id}`),
  create: (data: any) => api.post('/expenses', data),
  update: (id: string, data: any) => api.patch(`/expenses/${id}`, data),
  delete: (id: string) => api.delete(`/expenses/${id}`),
};

// Bills API
export const billsApi = {
  getAll: (params?: Record<string, any>) => api.get('/bills', { params }),
  getOne: (id: string) => api.get(`/bills/${id}`),
  create: (data: any) => api.post('/bills', data),
  update: (id: string, data: any) => api.patch(`/bills/${id}`, data),
  delete: (id: string) => api.delete(`/bills/${id}`),
  open: (id: string) => api.patch(`/bills/${id}/open`),
};

// Payments Made API
export const paymentsMadeApi = {
  getAll: (params?: Record<string, any>) => api.get('/payments-made', { params }),
  getOne: (id: string) => api.get(`/payments-made/${id}`),
  create: (data: any) => api.post('/payments-made', data),
  delete: (id: string) => api.delete(`/payments-made/${id}`),
};

// Vendor Credits API
export const vendorCreditsApi = {
  getAll: (params?: Record<string, any>) => api.get('/vendor-credits', { params }),
  getOne: (id: string) => api.get(`/vendor-credits/${id}`),
  create: (data: any) => api.post('/vendor-credits', data),
  applyToBill: (id: string, billId: string) => api.patch(`/vendor-credits/${id}/apply`, { billId }),
  refund: (id: string, bankAccountId: string) => api.patch(`/vendor-credits/${id}/refund`, { bankAccountId }),
};

// Items API
export const itemsApi = {
  getAll: (params?: Record<string, any>) => api.get('/items', { params }),
  getOne: (id: string) => api.get(`/items/${id}`),
  create: (data: any) => api.post('/items', data),
  update: (id: string, data: any) => api.put(`/items/${id}`, data),
  delete: (id: string) => api.delete(`/items/${id}`),
};

// Accounts API
export const accountsApi = {
  getAll: (params?: Record<string, any>) => api.get('/accounts', { params }),
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
  getOne: (id: string) => api.get(`/journals/${id}`),
  create: (data: any) => api.post('/journals', data),
  update: (id: string, data: any) => api.patch(`/journals/${id}`, data),
  delete: (id: string) => api.delete(`/journals/${id}`),
  post: (id: string) => api.post(`/journals/${id}/post`),
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
  getWeeklySummary: (weekStart: string) => api.get(`/timesheets/weekly-summary?weekStart=${weekStart}`),
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
  forecastRevenue: (months?: number) => api.get(`/ai/forecast/revenue${months ? `?months=${months}` : ''}`),
  forecastCashFlow: (weeks?: number) => api.get(`/ai/forecast/cash-flow${weeks ? `?weeks=${weeks}` : ''}`),
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

// Export main api for direct usage
export { api };
