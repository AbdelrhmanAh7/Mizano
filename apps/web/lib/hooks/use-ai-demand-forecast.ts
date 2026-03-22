import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';

// ============ Types ============

export interface ForecastPoint {
  date: string;
  predicted: number;
  lowerBound: number;
  upperBound: number;
  seasonalIndex: number;
}

export interface DemandForecast {
  forecasts: ForecastPoint[];
  model: {
    level: number;
    trend: number;
    seasonalIndices: number[];
    mape: number;
  };
  dataPoints: number;
  confidence: 'high' | 'medium' | 'low';
  method: 'holt-winters' | 'double-exponential' | 'simple-exponential';
}

export interface SeasonalityPattern {
  pattern: 'seasonal' | 'trending' | 'stable' | 'volatile';
  seasonalStrength: number;
  trendStrength: number;
  monthlyIndices: number[];
  peakMonths: number[];
  lowMonths: number[];
}

export interface ItemTrend {
  direction: 'up' | 'down' | 'flat';
  magnitude: number;
  confidence: number;
}

export interface ForecastDashboard {
  totalItems: number;
  itemsWithForecasts: number;
  highConfidenceCount: number;
  avgMAPE: number;
  topGrowingItems: Array<{
    itemId: string;
    itemName: string;
    growthRate: number;
  }>;
  topDecliningItems: Array<{
    itemId: string;
    itemName: string;
    declineRate: number;
  }>;
}

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

// ============ Hooks ============

export function useItemDemandForecast(
  itemId: string,
  horizon?: number,
  params?: { alpha?: number; beta?: number; gamma?: number; seasonLength?: number },
) {
  return useQuery({
    queryKey: ['ai-demand-forecast', itemId, horizon, params],
    queryFn: () => demandForecastApi.getDemandForecast(itemId, horizon, params),
    enabled: !!itemId,
  });
}

export function useItemSeasonality(itemId: string) {
  return useQuery({
    queryKey: ['ai-demand-seasonality', itemId],
    queryFn: () => demandForecastApi.getSeasonality(itemId),
    enabled: !!itemId,
  });
}

export function useItemTrend(itemId: string) {
  return useQuery({
    queryKey: ['ai-demand-trend', itemId],
    queryFn: () => demandForecastApi.getItemTrend(itemId),
    enabled: !!itemId,
  });
}

export function useForecastDashboard() {
  return useQuery({
    queryKey: ['ai-demand-forecast-dashboard'],
    queryFn: () => demandForecastApi.getForecastDashboard(),
  });
}

export function useRecalculateForecasts() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: demandForecastApi.recalculateForecasts,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-demand-forecast'] });
      queryClient.invalidateQueries({ queryKey: ['ai-demand-seasonality'] });
      queryClient.invalidateQueries({ queryKey: ['ai-demand-trend'] });
      queryClient.invalidateQueries({ queryKey: ['ai-demand-forecast-dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['ai-reorder'] });
    },
  });
}

export function useApplyHolidayConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ itemId, config }: { itemId: string; config: HolidayConfig }) =>
      demandForecastApi.applyHolidayConfig(itemId, config),
    onSuccess: (_, { itemId }) => {
      queryClient.invalidateQueries({ queryKey: ['ai-demand-forecast', itemId] });
    },
  });
}

// ============ Helper Functions ============

export function getForecastConfidenceLabel(confidence: 'high' | 'medium' | 'low'): string {
  const labels = {
    high: 'High Confidence',
    medium: 'Medium Confidence',
    low: 'Low Confidence',
  };
  return labels[confidence];
}

export function getForecastMethodLabel(
  method: 'holt-winters' | 'double-exponential' | 'simple-exponential',
): string {
  const labels = {
    'holt-winters': 'Holt-Winters (Seasonal)',
    'double-exponential': 'Double Exponential (Trending)',
    'simple-exponential': 'Simple Exponential (Basic)',
  };
  return labels[method];
}

export function formatMAPE(mape: number): string {
  return `${mape.toFixed(1)}% error`;
}

export function getSeasonalPatternLabel(
  pattern: 'seasonal' | 'trending' | 'stable' | 'volatile',
): string {
  const labels = {
    seasonal: 'Seasonal Pattern',
    trending: 'Trending Pattern',
    stable: 'Stable Pattern',
    volatile: 'Volatile Pattern',
  };
  return labels[pattern];
}

export function getSeasonalPatternIcon(
  pattern: 'seasonal' | 'trending' | 'stable' | 'volatile',
): string {
  const icons = {
    seasonal: '🔄',
    trending: '📈',
    stable: '➡️',
    volatile: '📊',
  };
  return icons[pattern];
}
