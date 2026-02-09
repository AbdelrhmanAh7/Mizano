import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';

// ============ Types ============

export type PatternStatus = 'DETECTED' | 'CONFIRMED' | 'CONVERTED' | 'DISMISSED' | 'STALE';
export type SuggestionType = 'CREATE_RECURRING' | 'DUPLICATE_WARNING' | 'FREQUENCY_CHANGE';
export type SuggestionStatus = 'PENDING' | 'ACCEPTED' | 'DISMISSED';

export interface TransactionPattern {
  id: string;
  entityType: string;
  entityId?: string;
  entityName: string;
  amountCluster: number;
  amountVariance: number;
  frequency?: string;
  frequencyDays?: number;
  frequencyStdDev?: number;
  occurrenceCount: number;
  firstOccurrence: string;
  lastOccurrence: string;
  descriptionPattern?: string;
  confidence: number;
  status: PatternStatus;
  createdAt: string;
  occurrences?: PatternOccurrence[];
  suggestions?: PatternSuggestion[];
}

export interface PatternOccurrence {
  id: string;
  patternId: string;
  sourceType: string;
  sourceId: string;
  amount: number;
  date: string;
  description?: string;
}

export interface PatternSuggestion {
  id: string;
  patternId: string;
  suggestionType: SuggestionType;
  suggestedFrequency?: string;
  suggestedAmount: number;
  confidence: number;
  status: SuggestionStatus;
  recurringProfileId?: string;
  dismissedAt?: string;
  dismissedReason?: string;
  pattern?: TransactionPattern;
}

export interface PatternAnalysisResult {
  patternsDetected: number;
  suggestionsCreated: number;
  duplicatesFound: number;
}

export interface DuplicateCheckResult {
  isDuplicate: boolean;
  matchingTransaction?: any;
  warning?: string;
}

// ============ API Functions ============

const patternApi = {
  getPatterns: async (params?: {
    status?: PatternStatus;
    entityType?: string;
    page?: number;
    limit?: number;
  }) => {
    const response = await api.get('/ai/patterns', { params });
    return response.data;
  },
  getPattern: async (id: string) => {
    const response = await api.get(`/ai/patterns/${id}`);
    return response.data;
  },
  getPendingSuggestions: async (limit?: number) => {
    const response = await api.get('/ai/patterns/suggestions', { params: { limit } });
    return response.data;
  },
  runPatternAnalysis: async () => {
    const response = await api.post('/ai/patterns/analyze');
    return response.data;
  },
  acceptSuggestion: async (suggestionId: string, options?: { autoPost?: boolean; name?: string }) => {
    const response = await api.post(`/ai/patterns/suggestions/${suggestionId}/accept`, options);
    return response.data;
  },
  dismissSuggestion: async (suggestionId: string, reason?: string) => {
    const response = await api.post(`/ai/patterns/suggestions/${suggestionId}/dismiss`, { reason });
    return response.data;
  },
  checkDuplicate: async (data: { entityName: string; amount: number; date: string }) => {
    const response = await api.post('/ai/patterns/check-duplicate', data);
    return response.data;
  },
};

// ============ Hooks ============

export function usePatterns(params?: {
  status?: PatternStatus;
  entityType?: string;
  page?: number;
  limit?: number;
}) {
  return useQuery({
    queryKey: ['ai-patterns', params],
    queryFn: () => patternApi.getPatterns(params),
  });
}

export function usePattern(id: string) {
  return useQuery({
    queryKey: ['ai-patterns', id],
    queryFn: () => patternApi.getPattern(id),
    enabled: !!id,
  });
}

export function usePendingSuggestions(limit?: number) {
  return useQuery({
    queryKey: ['ai-pattern-suggestions', limit],
    queryFn: () => patternApi.getPendingSuggestions(limit),
  });
}

export function useRunPatternAnalysis() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: patternApi.runPatternAnalysis,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-patterns'] });
      queryClient.invalidateQueries({ queryKey: ['ai-pattern-suggestions'] });
    },
  });
}

export function useAcceptSuggestion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ suggestionId, options }: { suggestionId: string; options?: { autoPost?: boolean; name?: string } }) =>
      patternApi.acceptSuggestion(suggestionId, options),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-patterns'] });
      queryClient.invalidateQueries({ queryKey: ['ai-pattern-suggestions'] });
      queryClient.invalidateQueries({ queryKey: ['recurring-profiles'] });
    },
  });
}

export function useDismissSuggestion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ suggestionId, reason }: { suggestionId: string; reason?: string }) =>
      patternApi.dismissSuggestion(suggestionId, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-pattern-suggestions'] });
    },
  });
}

export function useCheckDuplicate() {
  return useMutation({
    mutationFn: patternApi.checkDuplicate,
  });
}

// ============ Helper Functions ============

export function getPatternStatusColor(status: PatternStatus): string {
  const colors: Record<PatternStatus, string> = {
    DETECTED: 'bg-blue-100 text-blue-800 border-blue-200',
    CONFIRMED: 'bg-green-100 text-green-800 border-green-200',
    CONVERTED: 'bg-purple-100 text-purple-800 border-purple-200',
    DISMISSED: 'bg-gray-100 text-gray-800 border-gray-200',
    STALE: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  };
  return colors[status] || '';
}

export function getPatternStatusLabel(status: PatternStatus): string {
  const labels: Record<PatternStatus, string> = {
    DETECTED: 'Detected',
    CONFIRMED: 'Confirmed',
    CONVERTED: 'Converted to Recurring',
    DISMISSED: 'Dismissed',
    STALE: 'Stale (No Recent Activity)',
  };
  return labels[status] || status;
}

export function getSuggestionTypeIcon(type: SuggestionType): string {
  const icons: Record<SuggestionType, string> = {
    CREATE_RECURRING: '🔄',
    DUPLICATE_WARNING: '⚠️',
    FREQUENCY_CHANGE: '📅',
  };
  return icons[type] || '📊';
}

export function getSuggestionTypeLabel(type: SuggestionType): string {
  const labels: Record<SuggestionType, string> = {
    CREATE_RECURRING: 'Create Recurring Profile',
    DUPLICATE_WARNING: 'Potential Duplicate',
    FREQUENCY_CHANGE: 'Frequency Change Detected',
  };
  return labels[type] || type;
}
