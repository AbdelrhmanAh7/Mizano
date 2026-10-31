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
