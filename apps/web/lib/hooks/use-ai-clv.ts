import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';

// ============ Types ============

export interface CustomerCLV {
  customerId: string;
  customerName: string;
  clv: number;
  segment: 'PLATINUM' | 'GOLD' | 'SILVER' | 'BRONZE';
  totalRevenue: number;
  averageOrderValue: number;
  purchaseFrequency: number;
  customerLifetime: number; // days
  projectedValue: number;
  confidence: number;
}

export interface CLVSegment {
  segment: string;
  count: number;
  totalCLV: number;
  averageCLV: number;
  percentage: number;
}

export interface CLVDistribution {
  segments: CLVSegment[];
  totalCustomers: number;
  totalCLV: number;
}

export interface CLVCalculationResult {
  total: number;
  calculated: number;
  failed: number;
  message: string;
}

// ============ API Functions ============

const clvApi = {
  getCustomerCLV: async (customerId: string) => {
    const response = await api.get(`/ai/clv/customer/${customerId}`);
    return response.data;
  },
  getCLVSegments: async () => {
    const response = await api.get('/ai/clv/segments');
    return response.data;
  },
  getCLVDistribution: async () => {
    const response = await api.get('/ai/clv/distribution');
    return response.data;
  },
  calculateAll: async () => {
    const response = await api.post('/ai/clv/calculate-all');
    return response.data;
  },
};

// ============ Hooks ============

export function useCustomerCLV(customerId: string) {
  return useQuery({
    queryKey: ['ai-clv', customerId],
    queryFn: () => clvApi.getCustomerCLV(customerId),
    enabled: !!customerId,
  });
}

export function useCLVSegments() {
  return useQuery({
    queryKey: ['ai-clv-segments'],
    queryFn: clvApi.getCLVSegments,
  });
}

export function useCLVDistribution() {
  return useQuery({
    queryKey: ['ai-clv-distribution'],
    queryFn: clvApi.getCLVDistribution,
  });
}

export function useCalculateAllCLV() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: clvApi.calculateAll,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-clv'] });
    },
  });
}

// ============ Helper Functions ============

export function getSegmentColor(segment: string): string {
  const colors: Record<string, string> = {
    PLATINUM: 'bg-purple-100 text-purple-800 border-purple-200',
    GOLD: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    SILVER: 'bg-gray-100 text-gray-800 border-gray-200',
    BRONZE: 'bg-orange-100 text-orange-800 border-orange-200',
  };
  return colors[segment] || colors.SILVER;
}

export function getSegmentLabel(segment: string): string {
  const labels: Record<string, string> = {
    PLATINUM: 'Platinum',
    GOLD: 'Gold',
    SILVER: 'Silver',
    BRONZE: 'Bronze',
  };
  return labels[segment] || segment;
}

export function formatCLV(clv: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(clv);
}
