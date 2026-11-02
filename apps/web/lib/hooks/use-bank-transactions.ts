'use client';

import { bankTransactionsApi, reconciliationApi } from '@/lib/api';
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
  /** An open document to settle, or a payment already recorded (matching it posts nothing). */
  type: 'INVOICE' | 'BILL' | 'PAYMENT_RECEIVED' | 'PAYMENT_MADE' | 'EXPENSE';
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

/** One line of `GET /reconciliation/suggestions/:bankAccountId`: a pending bank line and its candidates. */
type MatchEntityType = 'invoice' | 'bill' | 'payment_received' | 'payment_made' | 'expense';

interface SuggestionRow {
  transaction: { id: string };
  matches: Array<{ type: MatchEntityType; entity: Record<string, unknown>; confidence: number }>;
}

const MATCH_TYPES: Record<MatchEntityType, SuggestedMatch['type']> = {
  invoice: 'INVOICE',
  bill: 'BILL',
  payment_received: 'PAYMENT_RECEIVED',
  payment_made: 'PAYMENT_MADE',
  expense: 'EXPENSE',
};

/** The API's entity type for a candidate (the inverse of MATCH_TYPES). */
const ENTITY_TYPES = Object.fromEntries(
  Object.entries(MATCH_TYPES).map(([entity, type]) => [type, entity]),
) as Record<SuggestedMatch['type'], MatchEntityType>;

/**
 * A recorded payment or paid expense is already in the books: matching it links the bank line and
 * posts nothing (#635, #682).
 */
export const isRecordedPayment = (type: SuggestedMatch['type']): boolean =>
  type === 'PAYMENT_RECEIVED' || type === 'PAYMENT_MADE' || type === 'EXPENSE';

const asText = (value: unknown): string => (typeof value === 'string' ? value : '');
const nameOf = (party: unknown): string =>
  party && typeof party === 'object' ? asText((party as { name?: unknown }).name) : '';

/**
 * Turns the server's candidate (an invoice, bill or recorded payment with its customer or vendor)
 * into a row of the list. A payment has nothing left to settle, so its balance due is 0.
 */
function toSuggestedMatch(match: SuggestionRow['matches'][number]): SuggestedMatch {
  const { entity } = match;
  const type = MATCH_TYPES[match.type];
  const payment = isRecordedPayment(type);
  const expense = match.type === 'expense';
  // An expense has no number: its reference, else its description, names it.
  const number =
    match.type === 'invoice'
      ? entity.invoiceNumber
      : match.type === 'bill'
        ? entity.billNumber
        : expense
          ? asText(entity.reference) || entity.description
          : entity.paymentNumber;
  const incoming = match.type === 'invoice' || match.type === 'payment_received';
  return {
    id: asText(entity.id),
    type,
    number: asText(number),
    date: asText(entity.date),
    // An expense's total (net + VAT) is what left the bank.
    amount: asText(payment && !expense ? entity.amount : entity.total) || '0',
    balanceDue: payment ? '0' : asText(entity.balanceDue) || '0',
    counterpartyName: nameOf(incoming ? entity.customer : entity.vendor),
    confidence: match.confidence,
  };
}

/** Candidates for one pending bank line, read from its account's suggestions (one request per account). */
export function pickSuggestedMatches(
  rows: SuggestionRow[],
  transactionId: string,
): SuggestedMatch[] {
  const row = rows.find((r) => r.transaction.id === transactionId);
  return (row?.matches ?? []).map(toSuggestedMatch);
}

export function useSuggestedMatches(bankAccountId: string, transactionId: string) {
  return useQuery({
    queryKey: ['bank-transactions', 'suggestions', bankAccountId],
    queryFn: async () => {
      const response = await reconciliationApi.getSuggestions(bankAccountId);
      const body: unknown = response.data;
      return (
        Array.isArray(body) ? body : ((body as { data?: unknown })?.data ?? [])
      ) as SuggestionRow[];
    },
    select: (rows) => pickSuggestedMatches(rows, transactionId),
    enabled: !!bankAccountId && !!transactionId,
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
      documentType: SuggestedMatch['type'];
    }) =>
      reconciliationApi.confirm({
        transactionId: id,
        entityType: ENTITY_TYPES[documentType],
        entityId: documentId,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bank-transactions'] });
      queryClient.invalidateQueries({ queryKey: ['bank-accounts'] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['bills'] });
      queryClient.invalidateQueries({ queryKey: ['payments-received'] });
      queryClient.invalidateQueries({ queryKey: ['payments-made'] });
      toast.success(t('transactionMatched'));
    },
    onError: (error: unknown) => {
      toast.error(getLocalizedApiErrorMessage(error, t('matchError'), tApiErrors));
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
