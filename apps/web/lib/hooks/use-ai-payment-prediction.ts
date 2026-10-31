import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';

// ============ API Functions ============

const paymentPredictionApi = {
  getPaymentPrediction: async (invoiceId: string) => {
    const response = await api.get(`/ai/payment-prediction/invoice/${invoiceId}`);
    return response.data;
  },
  getOutstandingPredictions: async () => {
    const response = await api.get('/ai/payment-prediction/outstanding');
    return response.data;
  },
  getCustomerPaymentProfile: async (customerId: string) => {
    const response = await api.get(`/ai/payment-prediction/customer/${customerId}/profile`);
    return response.data;
  },
  getCustomerPaymentHistory: async (customerId: string) => {
    const response = await api.get(`/ai/payment-prediction/customer/${customerId}/history`);
    return response.data;
  },
  getCollectionPriority: async () => {
    const response = await api.get('/ai/payment-prediction/collection-priority');
    return response.data;
  },
  rebuildPaymentProfiles: async () => {
    const response = await api.post('/ai/payment-prediction/rebuild-profiles');
    return response.data;
  },
};

export function useCollectionPriority() {
  return useQuery({
    queryKey: ['ai-collection-priority'],
    queryFn: () => paymentPredictionApi.getCollectionPriority(),
  });
}
