'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';

// ============ Types ============

export interface DeepSearchJob {
  id: string;
  status: 'PENDING' | 'SCRAPING' | 'ANALYZING' | 'GENERATING' | 'COMPLETED' | 'FAILED';
  progress: number;
  progressMessage: string | null;
  webSourcesScraped: number;
  codeFilesAnalyzed: number;
  suggestionsCount: number;
  error: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  suggestions?: DeepSearchSuggestion[];
}

export interface DeepSearchSuggestion {
  id: string;
  category: 'FEATURE_GAP' | 'PERFORMANCE_UX' | 'AI_CAPABILITY';
  title: string;
  description: string;
  impact: 'HIGH' | 'MEDIUM' | 'LOW';
  effort: 'HIGH' | 'MEDIUM' | 'LOW';
  priority: number;
  tags: string[];
  sources: { web: string[]; codeFiles: string[] } | null;
  prompt: string;
  status: 'pending' | 'accepted' | 'dismissed';
  createdAt: string;
}

export interface RunDeepSearchOptions {
  skipWeb?: boolean;
  categories?: string[];
  maxSuggestions?: number;
}

// ============ API Functions ============

const deepSearchApi = {
  run: async (options?: RunDeepSearchOptions) => {
    const response = await api.post('/ai/deep-search/run', options || {});
    return response.data;
  },
  getJobs: async (page = 1, limit = 10) => {
    const response = await api.get('/ai/deep-search/jobs', { params: { page, limit } });
    return response.data;
  },
  getJob: async (jobId: string) => {
    const response = await api.get(`/ai/deep-search/jobs/${jobId}`);
    return response.data;
  },
  updateSuggestion: async (suggestionId: string, status: string) => {
    const response = await api.patch(`/ai/deep-search/suggestions/${suggestionId}`, { status });
    return response.data;
  },
  getSuggestionPrompt: async (suggestionId: string) => {
    const response = await api.get(`/ai/deep-search/suggestions/${suggestionId}/prompt`);
    return response.data;
  },
};

// ============ Hooks ============

export function useDeepSearchJobs(page = 1, limit = 10) {
  return useQuery({
    queryKey: ['deep-search-jobs', page, limit],
    queryFn: async () => {
      const res = await deepSearchApi.getJobs(page, limit);
      return res as {
        data: DeepSearchJob[];
        meta: { page: number; limit: number; total: number; totalPages: number };
      };
    },
    staleTime: 10000,
  });
}

export function useDeepSearchJob(jobId: string | null) {
  return useQuery({
    queryKey: ['deep-search-job', jobId],
    queryFn: async () => {
      const res = await deepSearchApi.getJob(jobId!);
      return res.data as DeepSearchJob;
    },
    enabled: !!jobId,
    refetchInterval: (query) => {
      const data = query.state.data as DeepSearchJob | undefined;
      if (!data) return 2000;
      if (data.status === 'COMPLETED' || data.status === 'FAILED') return false;
      return 2000;
    },
  });
}

export function useRunDeepSearch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (options?: RunDeepSearchOptions) => deepSearchApi.run(options),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deep-search-jobs'] });
    },
  });
}

export function useUpdateSuggestion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ suggestionId, status }: { suggestionId: string; status: string }) =>
      deepSearchApi.updateSuggestion(suggestionId, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deep-search-job'] });
      queryClient.invalidateQueries({ queryKey: ['deep-search-jobs'] });
    },
  });
}

export function useSuggestionPrompt(suggestionId: string | null) {
  return useQuery({
    queryKey: ['deep-search-prompt', suggestionId],
    queryFn: async () => {
      const res = await deepSearchApi.getSuggestionPrompt(suggestionId!);
      return res.data as { prompt: string; title: string; category: string };
    },
    enabled: !!suggestionId,
    staleTime: Infinity,
  });
}

// ============ Helpers ============

export function getCategoryColor(category: DeepSearchSuggestion['category']) {
  const colors: Record<string, string> = {
    FEATURE_GAP: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
    PERFORMANCE_UX: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    AI_CAPABILITY: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  };
  return colors[category] || 'bg-gray-100 text-gray-800';
}

export function getCategoryLabel(category: DeepSearchSuggestion['category']) {
  const labels: Record<string, string> = {
    FEATURE_GAP: 'Feature Gap',
    PERFORMANCE_UX: 'Performance & UX',
    AI_CAPABILITY: 'AI Capability',
  };
  return labels[category] || category;
}

export function getImpactColor(impact: string) {
  const colors: Record<string, string> = {
    HIGH: 'text-red-600',
    MEDIUM: 'text-yellow-600',
    LOW: 'text-green-600',
  };
  return colors[impact] || 'text-gray-600';
}

export function getEffortColor(effort: string) {
  const colors: Record<string, string> = {
    HIGH: 'text-red-600',
    MEDIUM: 'text-yellow-600',
    LOW: 'text-green-600',
  };
  return colors[effort] || 'text-gray-600';
}

export function getStatusLabel(status: DeepSearchJob['status']) {
  const labels: Record<string, string> = {
    PENDING: 'Pending',
    SCRAPING: 'Scraping Web',
    ANALYZING: 'Analyzing Codebase',
    GENERATING: 'Generating Suggestions',
    COMPLETED: 'Completed',
    FAILED: 'Failed',
  };
  return labels[status] || status;
}
