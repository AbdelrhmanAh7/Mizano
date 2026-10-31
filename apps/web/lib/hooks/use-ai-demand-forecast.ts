import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';

export interface HolidayConfig {
  ramadan?: {
    enabled: boolean;
    multiplier: number;
    categories?: string[];
  };
  eid?: {
    enabled: boolean;
    multiplier: number;
  };
  customHolidays?: Array<{
    name: string;
    month: number;
    multiplier: number;
    categories?: string[];
  }>;
}

// ============ API Functions ============

const demandForecastApi = {
  getDemandForecast: async (
    itemId: string,
    horizon?: number,
    params?: {
      alpha?: number;
      beta?: number;
      gamma?: number;
      seasonLength?: number;
    },
  ) => {
    const response = await api.get(`/ai/demand-forecast/item/${itemId}`, {
      params: { horizon, ...params },
    });
    return response.data;
  },
  getSeasonality: async (itemId: string) => {
    const response = await api.get(`/ai/demand-forecast/item/${itemId}/seasonality`);
    return response.data;
  },
  getItemTrend: async (itemId: string) => {
    const response = await api.get(`/ai/demand-forecast/item/${itemId}/trend`);
    return response.data;
  },
  getForecastDashboard: async () => {
    const response = await api.get('/ai/demand-forecast/dashboard');
    return response.data;
  },
  recalculateForecasts: async () => {
    const response = await api.post('/ai/demand-forecast/recalculate');
    return response.data;
  },
  applyHolidayConfig: async (itemId: string, config: HolidayConfig) => {
    const response = await api.post(`/ai/demand-forecast/item/${itemId}/apply-holidays`, config);
    return response.data;
  },
};

export function useForecastDashboard() {
  return useQuery({
    queryKey: ['ai-demand-forecast-dashboard'],
    queryFn: () => demandForecastApi.getForecastDashboard(),
  });
}
