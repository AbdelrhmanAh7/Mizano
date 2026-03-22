import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';

// ============ Types ============

export interface FraudScore {
  entityType: string;
  entityId: string;
  fraudScore: number; // 0-1
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  flags: string[];
  reasons: string[];
  recommendations: string[];
  confidence: number;
}

export interface FraudAlert {
  id: string;
  entityType: string;
  entityId: string;
  alertType: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  description: string;
  detectedAt: string;
  status: 'PENDING' | 'INVESTIGATING' | 'RESOLVED' | 'FALSE_POSITIVE';
  fraudScore: number;
  recommendations: string[];
}

export interface FraudScanResult {
  total: number;
  flagged: number;
  highRisk: number;
  alerts: FraudAlert[];
}

export interface ResolveAlertResult {
  success: boolean;
  message: string;
}

// ============ API Functions ============

const fraudApi = {
  getFraudScore: async (entityType: string, entityId: string) => {
    const response = await api.get(`/ai/fraud/score/${entityType}/${entityId}`);
    return response.data;
  },
  getFraudAlerts: async (limit?: number) => {
    const response = await api.get('/ai/fraud/alerts', {
      params: { limit },
    });
    return response.data;
  },
  runFraudScan: async () => {
    const response = await api.post('/ai/fraud/scan');
    return response.data;
  },
  resolveAlert: async (alertId: string, resolution: string) => {
    const response = await api.patch(`/ai/fraud/alerts/${alertId}/resolve`, {
      resolution,
    });
    return response.data;
  },
};

// ============ Hooks ============

export function useFraudScore(entityType: string, entityId: string) {
  return useQuery({
    queryKey: ['ai-fraud-score', entityType, entityId],
    queryFn: () => fraudApi.getFraudScore(entityType, entityId),
    enabled: !!entityType && !!entityId,
  });
}

export function useFraudAlerts(limit?: number) {
  return useQuery({
    queryKey: ['ai-fraud-alerts', limit],
    queryFn: () => fraudApi.getFraudAlerts(limit),
  });
}

export function useRunFraudScan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fraudApi.runFraudScan,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-fraud'] });
    },
  });
}

export function useResolveFraudAlert() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ alertId, resolution }: { alertId: string; resolution: string }) =>
      fraudApi.resolveAlert(alertId, resolution),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-fraud-alerts'] });
    },
  });
}

// ============ Helper Functions ============

export function getRiskLevelColor(riskLevel: string): string {
  const colors: Record<string, string> = {
    LOW: 'bg-green-100 text-green-800 border-green-200',
    MEDIUM: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    HIGH: 'bg-orange-100 text-orange-800 border-orange-200',
    CRITICAL: 'bg-red-100 text-red-800 border-red-200',
  };
  return colors[riskLevel] || colors.MEDIUM;
}

export function getSeverityColor(severity: string): string {
  const colors: Record<string, string> = {
    LOW: 'text-green-600',
    MEDIUM: 'text-yellow-600',
    HIGH: 'text-orange-600',
    CRITICAL: 'text-red-600',
  };
  return colors[severity] || colors.MEDIUM;
}

export function formatFraudScore(score: number): string {
  return `${Math.round(score * 100)}%`;
}

export function getAlertStatusColor(status: string): string {
  const colors: Record<string, string> = {
    PENDING: 'bg-yellow-100 text-yellow-800',
    INVESTIGATING: 'bg-blue-100 text-blue-800',
    RESOLVED: 'bg-green-100 text-green-800',
    FALSE_POSITIVE: 'bg-gray-100 text-gray-800',
  };
  return colors[status] || colors.PENDING;
}
