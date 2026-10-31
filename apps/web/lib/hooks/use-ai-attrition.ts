import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';

// ============ API Functions ============

const attritionApi = {
  predictAttrition: async (employeeId: string) => {
    const response = await api.get(`/ai/attrition/employee/${employeeId}`);
    return response.data;
  },
  getFlightRisk: async (limit?: number) => {
    const response = await api.get('/ai/attrition/flight-risk', {
      params: { limit },
    });
    return response.data;
  },
  predictAll: async () => {
    const response = await api.post('/ai/attrition/predict-all');
    return response.data;
  },
  trainModel: async () => {
    const response = await api.post('/ai/attrition/train');
    return response.data;
  },
};

export function useFlightRisk(limit?: number) {
  return useQuery({
    queryKey: ['ai-attrition-flight-risk', limit],
    queryFn: () => attritionApi.getFlightRisk(limit),
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

export function formatAttritionRisk(risk: number): string {
  return `${Math.round(risk * 100)}%`;
}

export function formatTenure(months: number): string {
  const years = Math.floor(months / 12);
  const remainingMonths = months % 12;
  if (years === 0) return `${remainingMonths} month${remainingMonths !== 1 ? 's' : ''}`;
  if (remainingMonths === 0) return `${years} year${years !== 1 ? 's' : ''}`;
  return `${years}y ${remainingMonths}m`;
}
