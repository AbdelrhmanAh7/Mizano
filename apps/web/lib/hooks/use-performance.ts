'use client';

import { useToast } from '@/components/ui/use-toast';
import { performanceApi } from '@/lib/api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

// Types
export interface QueryMetricEntry {
  model: string;
  action: string;
  duration: number;
  timestamp: string;
  isSlow: boolean;
}

export interface QueryStatsResponse {
  totalQueries: number;
  avgDuration: number;
  slowQueryCount: number;
  p50: number;
  p95: number;
  p99: number;
  bufferSize: number;
}

export interface QueryDistributionItem {
  model: string;
  count: number;
  avgDuration: number;
}

export interface TimeTrendItem {
  bucket: string;
  avgDuration: number;
  count: number;
}

export interface DatabaseHealth {
  status: 'healthy' | 'unhealthy';
  primaryConnected: boolean;
  replicaConfigured: boolean;
  replicaConnected: boolean;
  poolSize: number;
  uptimeSeconds: number;
  primaryLatencyMs: number;
  replicaLatencyMs?: number;
}

export interface IndexRecommendation {
  table: string;
  columns: string[];
  reason: string;
  estimatedImpact: number;
  suggestedSQL: string;
}

export interface SlowQueryParams {
  page?: number;
  limit?: number;
  threshold?: number;
  model?: string;
  action?: string;
}

// Hooks

export function useSlowQueries(params?: SlowQueryParams) {
  return useQuery({
    queryKey: ['performance', 'slow-queries', params],
    queryFn: async () => {
      const { data } = await performanceApi.getSlowQueries(params as Record<string, unknown>);
      return data as {
        data: QueryMetricEntry[];
        meta: { page: number; limit: number; total: number; totalPages: number };
      };
    },
    refetchInterval: 15000,
  });
}

export function useQueryStats() {
  return useQuery({
    queryKey: ['performance', 'stats'],
    queryFn: async () => {
      const { data } = await performanceApi.getStats();
      return data as QueryStatsResponse;
    },
    refetchInterval: 10000,
  });
}

export function useQueryDistribution() {
  return useQuery({
    queryKey: ['performance', 'distribution'],
    queryFn: async () => {
      const { data } = await performanceApi.getDistribution();
      return data as QueryDistributionItem[];
    },
    refetchInterval: 15000,
  });
}

export function useResponseTimeTrend(interval = 5) {
  return useQuery({
    queryKey: ['performance', 'trend', interval],
    queryFn: async () => {
      const { data } = await performanceApi.getTrend(interval);
      return data as TimeTrendItem[];
    },
    refetchInterval: 15000,
  });
}

export function useDatabaseHealth() {
  return useQuery({
    queryKey: ['performance', 'health'],
    queryFn: async () => {
      const { data } = await performanceApi.getHealth();
      return data as DatabaseHealth;
    },
    refetchInterval: 30000,
  });
}

export function useIndexRecommendations() {
  return useQuery({
    queryKey: ['performance', 'index-recommendations'],
    queryFn: async () => {
      const { data } = await performanceApi.getIndexRecommendations();
      return data as IndexRecommendation[];
    },
  });
}

export function useResetMetrics() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async () => {
      const { data } = await performanceApi.resetMetrics();
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['performance'] });
      toast({ title: 'Metrics reset', description: 'Query metrics buffer has been cleared.' });
    },
    onError: () => {
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to reset metrics.' });
    },
  });
}
