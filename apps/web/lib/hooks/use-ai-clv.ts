import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';

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

export function useCLVSegments() {
  return useQuery({
    queryKey: ['ai-clv-segments'],
    queryFn: clvApi.getCLVSegments,
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

export function formatCLV(clv: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(clv);
}
