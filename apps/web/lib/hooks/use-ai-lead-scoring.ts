import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';

// ============ Types ============

export type LeadTier = 'HOT' | 'WARM' | 'COOL' | 'COLD';

export interface LeadScore {
  leadId: string;
  totalScore: number;
  demographicScore: number;
  behavioralScore: number;
  engagementScore: number;
  tier: LeadTier;
  conversionProbability: number;
  breakdown: Array<{
    category: string;
    rule: string;
    score: number;
  }>;
  predictionMethod: 'ML' | 'RULE_BASED' | 'HYBRID';
}

export interface HotLead {
  leadId: string;
  leadName: string;
  company: string;
  score: number;
  tier: LeadTier;
  conversionProbability: number;
  lastActivity: string;
  recommendedAction: string;
}

export interface ColdLead {
  leadId: string;
  leadName: string;
  score: number;
  daysInactive: number;
  reengagementSuggestion: string;
}

export interface ConversionPrediction {
  probability: number;
  confidence: 'high' | 'medium' | 'low';
  factors: Array<{
    factor: string;
    impact: 'positive' | 'negative';
    weight: number;
  }>;
  recommendation: string;
}

export interface ScoreHistoryEntry {
  date: string;
  score: number;
  change: number;
  reason: string;
}

export interface ScoreDistribution {
  hot: number;
  warm: number;
  cool: number;
  cold: number;
  total: number;
  avgScore: number;
}

// ============ API Functions ============

const leadScoringApi = {
  getLeadScore: async (leadId: string) => {
    const response = await api.get(`/ai/lead-scoring/lead/${leadId}`);
    return response.data;
  },
  rescoreLead: async (leadId: string) => {
    const response = await api.post(`/ai/lead-scoring/lead/${leadId}/rescore`);
    return response.data;
  },
  getHotLeads: async (limit?: number) => {
    const response = await api.get('/ai/lead-scoring/hot', {
      params: { limit },
    });
    return response.data;
  },
  getColdLeads: async (limit?: number) => {
    const response = await api.get('/ai/lead-scoring/cold', {
      params: { limit },
    });
    return response.data;
  },
  getConversionPrediction: async (leadId: string) => {
    const response = await api.get(`/ai/lead-scoring/lead/${leadId}/prediction`);
    return response.data;
  },
  getLeadScoreHistory: async (leadId: string) => {
    const response = await api.get(`/ai/lead-scoring/lead/${leadId}/history`);
    return response.data;
  },
  scoreAllLeads: async () => {
    const response = await api.post('/ai/lead-scoring/score-all');
    return response.data;
  },
  getScoreDistribution: async () => {
    const response = await api.get('/ai/lead-scoring/distribution');
    return response.data;
  },
};

// ============ Hooks ============

export function useLeadScore(leadId: string) {
  return useQuery({
    queryKey: ['ai-lead-score', leadId],
    queryFn: () => leadScoringApi.getLeadScore(leadId),
    enabled: !!leadId,
  });
}

export function useRescoreLead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (leadId: string) => leadScoringApi.rescoreLead(leadId),
    onSuccess: (_, leadId) => {
      queryClient.invalidateQueries({ queryKey: ['ai-lead-score', leadId] });
      queryClient.invalidateQueries({ queryKey: ['ai-hot-leads'] });
      queryClient.invalidateQueries({ queryKey: ['ai-cold-leads'] });
      queryClient.invalidateQueries({ queryKey: ['ai-lead-score-distribution'] });
    },
  });
}

export function useHotLeads(limit?: number) {
  return useQuery({
    queryKey: ['ai-hot-leads', limit],
    queryFn: () => leadScoringApi.getHotLeads(limit),
  });
}

export function useColdLeads(limit?: number) {
  return useQuery({
    queryKey: ['ai-cold-leads', limit],
    queryFn: () => leadScoringApi.getColdLeads(limit),
  });
}

export function useLeadConversionPrediction(leadId: string) {
  return useQuery({
    queryKey: ['ai-lead-conversion', leadId],
    queryFn: () => leadScoringApi.getConversionPrediction(leadId),
    enabled: !!leadId,
  });
}

export function useLeadScoreHistory(leadId: string) {
  return useQuery({
    queryKey: ['ai-lead-score-history', leadId],
    queryFn: () => leadScoringApi.getLeadScoreHistory(leadId),
    enabled: !!leadId,
  });
}

export function useScoreAllLeads() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: leadScoringApi.scoreAllLeads,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-lead-score'] });
      queryClient.invalidateQueries({ queryKey: ['ai-hot-leads'] });
      queryClient.invalidateQueries({ queryKey: ['ai-cold-leads'] });
      queryClient.invalidateQueries({ queryKey: ['ai-lead-score-distribution'] });
    },
  });
}

export function useLeadScoreDistribution() {
  return useQuery({
    queryKey: ['ai-lead-score-distribution'],
    queryFn: () => leadScoringApi.getScoreDistribution(),
  });
}

// ============ Helper Functions ============

export function getLeadTierColor(tier: LeadTier): string {
  const colors: Record<LeadTier, string> = {
    HOT: 'bg-red-500 text-white',
    WARM: 'bg-orange-500 text-white',
    COOL: 'bg-blue-500 text-white',
    COLD: 'bg-gray-400 text-white',
  };
  return colors[tier] || 'bg-gray-400 text-white';
}

export function getLeadTierBorderColor(tier: LeadTier): string {
  const colors: Record<LeadTier, string> = {
    HOT: 'border-red-500',
    WARM: 'border-orange-500',
    COOL: 'border-blue-500',
    COLD: 'border-gray-400',
  };
  return colors[tier] || 'border-gray-400';
}

export function getLeadTierLabel(tier: LeadTier): string {
  const labels: Record<LeadTier, string> = {
    HOT: 'Hot Lead',
    WARM: 'Warm Lead',
    COOL: 'Cool Lead',
    COLD: 'Cold Lead',
  };
  return labels[tier] || tier;
}

export function getLeadTierIcon(tier: LeadTier): string {
  const icons: Record<LeadTier, string> = {
    HOT: '🔥',
    WARM: '☀️',
    COOL: '❄️',
    COLD: '🧊',
  };
  return icons[tier] || '📊';
}
