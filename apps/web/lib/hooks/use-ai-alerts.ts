import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';

// ============ Types ============

export type AlertCategory = 'FINANCIAL' | 'COLLECTION' | 'INVENTORY' | 'COMPLIANCE' | 'HR' | 'CRM';
export type AlertPriority = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export interface AlertSummary {
  total: number;
  unread: number;
  byCategory: Record<AlertCategory, number>;
  byPriority: Record<AlertPriority, number>;
  criticalCount: number;
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
    return response.data?.data ?? response.data;
  },
  getAlertSummary: async (): Promise<AlertSummary> => {
    const response = await api.get('/ai/alerts/summary');
    return response.data?.data ?? response.data;
  },
  getCriticalAlerts: async (limit?: number) => {
    const response = await api.get('/ai/alerts/critical', { params: { limit } });
    return response.data?.data ?? response.data;
  },
  getAlertsByCategory: async (category: AlertCategory, limit?: number) => {
    const response = await api.get(`/ai/alerts/category/${category}`, { params: { limit } });
    return response.data?.data ?? response.data;
  },
  aggregateAlerts: async () => {
    const response = await api.post('/ai/alerts/aggregate');
    return response.data?.data ?? response.data;
  },
  markAsRead: async (alertId: string) => {
    const response = await api.post(`/ai/alerts/${alertId}/read`);
    return response.data?.data ?? response.data;
  },
  markAllAsRead: async (category?: AlertCategory) => {
    const response = await api.post('/ai/alerts/read-all', null, { params: { category } });
    return response.data?.data ?? response.data;
  },
  dismissAlert: async (alertId: string, reason?: string) => {
    const response = await api.post(`/ai/alerts/${alertId}/dismiss`, { reason });
    return response.data?.data ?? response.data;
  },
};

export function useAlertSummary() {
  return useQuery({
    queryKey: ['ai-alert-summary'],
    queryFn: () => alertsApi.getAlertSummary(),
    staleTime: 5 * 60 * 1000,
  });
}
