'use client';

import type { GlobalSearchParams, RecordSearchHistoryData } from '@/lib/api';
import { searchApi } from '@/lib/api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

// ============================================
// Types
// ============================================

export interface SearchResult {
  id: string;
  type: string;
  title: string;
  subtitle?: string;
  href: string;
  score: number;
}

export interface SearchGroup {
  type: string;
  label: string;
  results: SearchResult[];
}

export interface SearchResponse {
  data: SearchResult[];
  groups: SearchGroup[];
  query: string;
  totalResults: number;
}

export interface SearchHistoryItem {
  id: string;
  query: string;
  resultType: string | null;
  resultId: string | null;
  resultTitle: string | null;
  clickedAt: string;
}

export interface SearchHistoryResponse {
  data: SearchHistoryItem[];
}

// ============================================
// Hooks
// ============================================

/**
 * Global fuzzy search across all entities.
 * Debounce should be applied at the UI level before passing the query.
 */
export function useGlobalSearch(
  query: string,
  options?: { types?: string[]; fuzzyThreshold?: number },
) {
  const params: GlobalSearchParams = {
    q: query,
    ...(options?.types && { types: options.types }),
    ...(options?.fuzzyThreshold !== undefined && {
      fuzzyThreshold: options.fuzzyThreshold,
    }),
  };

  return useQuery({
    queryKey: ['global-search', query, options?.types, options?.fuzzyThreshold],
    queryFn: async () => {
      const res = await searchApi.search(params);
      return res.data as SearchResponse;
    },
    enabled: query.length >= 2,
    staleTime: 30_000,
    placeholderData: (prev: SearchResponse | undefined) => prev,
  });
}

/**
 * Fetch recent search history for the current user.
 */
export function useSearchHistory() {
  return useQuery({
    queryKey: ['search-history'],
    queryFn: async () => {
      const res = await searchApi.getHistory();
      return res.data as SearchHistoryResponse;
    },
    staleTime: 60_000,
  });
}

/**
 * Record a search interaction (query + optional result click) to history.
 */
export function useRecordSearchHistory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: RecordSearchHistoryData) => {
      const res = await searchApi.recordHistory(data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['search-history'] });
    },
  });
}

/**
 * Clear all search history for the current user.
 */
export function useClearSearchHistory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const res = await searchApi.clearHistory();
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['search-history'] });
    },
  });
}
