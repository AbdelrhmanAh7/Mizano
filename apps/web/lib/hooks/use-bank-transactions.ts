'use client';

import { bankTransactionsApi } from '@/lib/api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import { getLocalizedApiErrorMessage } from '@/lib/api-error';

export interface BankTransaction {
  id: string;
  bankAccountId: string;
  date: string;
  description: string;
  payee: string | null;
  reference: string | null;
  amount: string | number;
  type: 'DEPOSIT' | 'WITHDRAWAL';
  status: 'PENDING' | 'MATCHED' | 'CREATED' | 'RECONCILED';
  matchedDocumentId: string | null;
  matchedDocumentType: 'INVOICE' | 'BILL' | 'EXPENSE' | 'JOURNAL' | null;
  confidence: number | null;
  suggestedMatches?: SuggestedMatch[];
  bankAccount?: {
    id: string;
    accountName: string;
    bankName: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface SuggestedMatch {
  id: string;
  type: 'INVOICE' | 'BILL' | 'EXPENSE';
  number: string;
  date: string;
  amount: string | number;
  balanceDue: string | number;
  counterpartyName: string;
  confidence: number;
}

export type TransactionStatus = BankTransaction['status'];

export interface TransactionFilters {
  bankAccountId?: string;
  status?: TransactionStatus;
  dateFrom?: string;
  dateTo?: string;
  amountMin?: string;
  amountMax?: string;
  search?: string;
}

// Hooks
export function useBankTransactions(params?: TransactionFilters) {
  return useQuery({
    queryKey: ['bank-transactions', params],
    queryFn: async () => {
      const response = await bankTransactionsApi.getAll(params);
      return response.data;
    },
  });
}

export function useBankTransaction(id: string) {
  return useQuery({
    queryKey: ['bank-transactions', id],
    queryFn: async () => {
      const response = await bankTransactionsApi.getOne(id);
      return response.data?.data || response.data;
    },
    enabled: !!id,
  });
}

export function useUnmatchedTransactions(bankAccountId: string) {
  return useQuery({
    queryKey: ['bank-transactions', 'unmatched', bankAccountId],
    queryFn: async () => {
      const response = await bankTransactionsApi.getUnmatched(bankAccountId);
      return response.data;
    },
    enabled: !!bankAccountId,
  });
}

export function useSuggestedMatches(transactionId: string) {
  return useQuery({
    queryKey: ['bank-transactions', transactionId, 'suggested-matches'],
    queryFn: async () => {
      const response = await bankTransactionsApi.getSuggestedMatches(transactionId);
      return response.data;
    },
    enabled: !!transactionId,
  });
}

export function useMatchTransaction() {
  const queryClient = useQueryClient();
  const t = useTranslations('banking.toast');
  const tApiErrors = useTranslations('common.apiErrors');

  return useMutation({
    mutationFn: ({
      id,
      documentId,
      documentType,
    }: {
      id: string;
      documentId: string;
      documentType: string;
    }) => bankTransactionsApi.match(id, { documentId, documentType }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bank-transactions'] });
      queryClient.invalidateQueries({ queryKey: ['bank-accounts'] });
      toast.success(t('transactionMatched'));
    },
    onError: (error: unknown) => {
      toast.error(getLocalizedApiErrorMessage(error, t('matchError'), tApiErrors));
    },
  });
}

export function useExcludeTransaction() {
  const queryClient = useQueryClient();
  const t = useTranslations('banking.toast');
  const tApiErrors = useTranslations('common.apiErrors');

  return useMutation({
    mutationFn: bankTransactionsApi.exclude,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bank-transactions'] });
      toast.success(t('transactionExcluded'));
    },
    onError: (error: unknown) => {
      toast.error(getLocalizedApiErrorMessage(error, t('excludeError'), tApiErrors));
    },
  });
}

export function useImportTransactions() {
  const queryClient = useQueryClient();
  const t = useTranslations('banking.toast');
  const tApiErrors = useTranslations('common.apiErrors');

  return useMutation({
    mutationFn: ({ bankAccountId, file }: { bankAccountId: string; file: File }) => {
      const formData = new FormData();
      formData.append('file', file);
      return bankTransactionsApi.import(bankAccountId, formData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bank-transactions'] });
      queryClient.invalidateQueries({ queryKey: ['bank-accounts'] });
      toast.success(t('transactionsImported'));
    },
    onError: (error: unknown) => {
      toast.error(getLocalizedApiErrorMessage(error, t('importError'), tApiErrors));
    },
  });
}

// Helper functions
/** Translated label of a transaction status; `t` is `useTranslations('banking')`. */
export function getStatusLabel(status: TransactionStatus, t: (key: string) => string): string {
  const keys: Record<TransactionStatus, string> = {
    PENDING: 'transactions.status.pending',
    MATCHED: 'transactions.status.matched',
    CREATED: 'transactions.status.created',
    RECONCILED: 'transactions.status.reconciled',
  };
  return keys[status] ? t(keys[status]) : status;
}

export function getStatusColor(status: TransactionStatus): string {
  const colors: Record<TransactionStatus, string> = {
    PENDING: 'bg-yellow-100 text-yellow-800',
    MATCHED: 'bg-blue-100 text-blue-800',
    CREATED: 'bg-purple-100 text-purple-800',
    RECONCILED: 'bg-green-100 text-green-800',
  };
  return colors[status] || colors.PENDING;
}

export function getConfidenceColor(confidence: number | null): string {
  if (confidence === null) return 'text-muted-foreground';
  if (confidence >= 80) return 'text-green-600';
  if (confidence >= 50) return 'text-yellow-600';
  return 'text-red-600';
}

/** Translated confidence level; `t` is `useTranslations('banking')`. */
export function getConfidenceLabel(confidence: number | null, t: (key: string) => string): string {
  if (confidence === null) return t('reconciliation.confidenceLevels.none');
  if (confidence >= 80) return t('reconciliation.confidenceLevels.high');
  if (confidence >= 50) return t('reconciliation.confidenceLevels.medium');
  return t('reconciliation.confidenceLevels.low');
}
