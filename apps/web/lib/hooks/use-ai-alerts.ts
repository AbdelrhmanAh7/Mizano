import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';

// ============ Types ============

export type AlertCategory = 'FINANCIAL' | 'COLLECTION' | 'INVENTORY' | 'COMPLIANCE' | 'HR' | 'CRM';
export type AlertPriority = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
export type AlertSource =
  | 'CASH_FLOW'
  | 'ANOMALY'
  | 'PAYMENT_PREDICTION'
  | 'REORDER'
  | 'DEMAND_FORECAST'
  | 'LEAD_SCORING'
  | 'PATTERN_DETECTION'
  | 'TAX_COMPLIANCE'
  | 'PAYROLL';

export interface UnifiedAlert {
  id: string;
  category: AlertCategory;
  priority: AlertPriority;
  aiSource: AlertSource;
  title: string;
  description: string;
  sourceEntityType?: string;
  sourceEntityId?: string;
  actionUrl?: string;
  actionLabel?: string;
  expiresAt?: string;
  isRead: boolean;
  isDismissed: boolean;
  dismissedAt?: string;
  dismissedBy?: string;
  createdAt: string;
}

export interface AlertSummary {
  total: number;
  unread: number;
  byCategory: Record<AlertCategory, number>;
  byPriority: Record<AlertPriority, number>;
  criticalCount: number;
}

export interface AlertAggregationResult {
  created: number;
  updated: number;
  expired: number;
}

// ============ API Functions ============

const alertsApi = {
  getAlerts: async (params?: {
    category?: AlertCategory;
    priority?: AlertPriority;
    isRead?: boolean;
    page?: number;
    limit?: number;
  }) => {
    const response = await api.get('/ai/alerts', { params });
    return response.data;
  },
  getAlertSummary: async () => {
    const response = await api.get('/ai/alerts/summary');
    return response.data;
  },
  getCriticalAlerts: async (limit?: number) => {
    const response = await api.get('/ai/alerts/critical', { params: { limit } });
    return response.data;
  },
  getAlertsByCategory: async (category: AlertCategory, limit?: number) => {
    const response = await api.get(`/ai/alerts/category/${category}`, { params: { limit } });
    return response.data;
  },
  aggregateAlerts: async () => {
    const response = await api.post('/ai/alerts/aggregate');
    return response.data;
  },
  markAsRead: async (alertId: string) => {
    const response = await api.post(`/ai/alerts/${alertId}/read`);
    return response.data;
  },
  markAllAsRead: async (category?: AlertCategory) => {
    const response = await api.post('/ai/alerts/read-all', null, { params: { category } });
    return response.data;
  },
  dismissAlert: async (alertId: string, reason?: string) => {
    const response = await api.post(`/ai/alerts/${alertId}/dismiss`, { reason });
    return response.data;
  },
};

// ============ Hooks ============

export function useAiAlerts(params?: {
  category?: AlertCategory;
  priority?: AlertPriority;
  isRead?: boolean;
  page?: number;
  limit?: number;
}) {
  return useQuery({
    queryKey: ['ai-alerts', params],
    queryFn: () => alertsApi.getAlerts(params),
  });
}

export function useAlertSummary() {
  return useQuery({
    queryKey: ['ai-alert-summary'],
    queryFn: () => alertsApi.getAlertSummary(),
    staleTime: 5 * 60 * 1000,
  });
}

export function useCriticalAlerts(limit?: number) {
  return useQuery({
    queryKey: ['ai-critical-alerts', limit],
    queryFn: () => alertsApi.getCriticalAlerts(limit),
  });
}

export function useAlertsByCategory(category: AlertCategory, limit?: number) {
  return useQuery({
    queryKey: ['ai-alerts-category', category, limit],
    queryFn: () => alertsApi.getAlertsByCategory(category, limit),
    enabled: !!category,
  });
}

export function useAggregateAlerts() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: alertsApi.aggregateAlerts,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-alerts'] });
      queryClient.invalidateQueries({ queryKey: ['ai-alert-summary'] });
      queryClient.invalidateQueries({ queryKey: ['ai-critical-alerts'] });
    },
  });
}

export function useMarkAlertAsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: alertsApi.markAsRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-alerts'] });
      queryClient.invalidateQueries({ queryKey: ['ai-alert-summary'] });
    },
  });
}

export function useMarkAllAlertsAsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: alertsApi.markAllAsRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-alerts'] });
      queryClient.invalidateQueries({ queryKey: ['ai-alert-summary'] });
    },
  });
}

export function useDismissAlert() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ alertId, reason }: { alertId: string; reason?: string }) =>
      alertsApi.dismissAlert(alertId, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-alerts'] });
      queryClient.invalidateQueries({ queryKey: ['ai-alert-summary'] });
      queryClient.invalidateQueries({ queryKey: ['ai-critical-alerts'] });
    },
  });
}

// ============ Helper Functions ============

export function getAlertCategoryColor(category: AlertCategory): string {
  const colors: Record<AlertCategory, string> = {
    FINANCIAL: 'bg-green-100 text-green-800',
    COLLECTION: 'bg-yellow-100 text-yellow-800',
    INVENTORY: 'bg-blue-100 text-blue-800',
    COMPLIANCE: 'bg-red-100 text-red-800',
    HR: 'bg-purple-100 text-purple-800',
    CRM: 'bg-indigo-100 text-indigo-800',
  };
  return colors[category] || '';
}

export function getAlertCategoryIcon(category: AlertCategory): string {
  const icons: Record<AlertCategory, string> = {
    FINANCIAL: '💰',
    COLLECTION: '📥',
    INVENTORY: '📦',
    COMPLIANCE: '⚖️',
    HR: '👥',
    CRM: '🤝',
  };
  return icons[category] || '📊';
}

export function getAlertPriorityColor(priority: AlertPriority): string {
  const colors: Record<AlertPriority, string> = {
    CRITICAL: 'bg-red-500 text-white',
    HIGH: 'bg-orange-500 text-white',
    MEDIUM: 'bg-yellow-500 text-white',
    LOW: 'bg-blue-500 text-white',
  };
  return colors[priority] || '';
}

export function getAlertSourceLabel(source: AlertSource): string {
  const labels: Record<AlertSource, string> = {
    CASH_FLOW: 'Cash Flow',
    ANOMALY: 'Anomaly Detection',
    PAYMENT_PREDICTION: 'Payment Prediction',
    REORDER: 'Inventory Reorder',
    DEMAND_FORECAST: 'Demand Forecast',
    LEAD_SCORING: 'Lead Scoring',
    PATTERN_DETECTION: 'Pattern Detection',
    TAX_COMPLIANCE: 'Tax Compliance',
    PAYROLL: 'Payroll',
  };
  return labels[source] || source;
}
