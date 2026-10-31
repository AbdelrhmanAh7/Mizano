import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';

// ============ API Functions ============

const churnApi = {
  predictChurn: async (customerId: string) => {
    const response = await api.get(`/ai/churn/customer/${customerId}`);
    return response.data;
  },
  getHighRiskCustomers: async (limit?: number) => {
    const response = await api.get('/ai/churn/high-risk', {
      params: { limit },
    });
    return response.data;
  },
  predictAll: async () => {
    const response = await api.post('/ai/churn/predict-all');
    return response.data;
  },
  trainModel: async () => {
    const response = await api.post('/ai/churn/train');
    return response.data;
  },
};

export function useHighRiskCustomers(limit?: number) {
  return useQuery({
    queryKey: ['ai-churn-high-risk', limit],
    queryFn: () => churnApi.getHighRiskCustomers(limit),
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

export function formatChurnRisk(risk: number): string {
  return `${Math.round(risk * 100)}%`;
}
