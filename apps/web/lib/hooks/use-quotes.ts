'use client';

import { quotesApi } from '@/lib/api';
import { useToastMutation } from '@/lib/hooks/use-toast-mutation';
import { useInfiniteTableData } from '@/lib/hooks/use-infinite-table-data';
import { useQuery } from '@tanstack/react-query';

// Types
export type QuoteStatus = 'DRAFT' | 'SENT' | 'ACCEPTED' | 'INVOICED' | 'DECLINED' | 'EXPIRED';

export interface QuoteLine {
  id?: string;
  itemId?: string;
  description: string;
  quantity: string;
  rate: string;
  discountPercent?: string;
  /** Server line discount percent. */
  discount?: string;
  /** Server line tax percent (14 means 14%). */
  taxRate?: string;
  taxRateId?: string;
  amount: string;
  item?: {
    id: string;
    name: string;
    sku: string;
  };
}

export interface Quote {
  id: string;
  quoteNumber: string;
  customerId: string;
  customer?: {
    id: string;
    name: string;
    displayName?: string | null;
    email: string | null;
    currency?: string;
  };
  date: string;
  expiryDate: string;
  status: QuoteStatus;
  reference?: string | null;
  subject?: string | null;
  subtotal: string;
  discountAmount?: string | null;
  taxAmount: string;
  grandTotal: string;
  /** Null means the organization base currency. */
  currencyCode?: string | null;
  notes: string | null;
  terms: string | null;
  lines: QuoteLine[];
  organizationId: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface QuoteParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: QuoteStatus;
  customerId?: string;
  dateFrom?: string;
  dateTo?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

interface CreateQuoteData {
  customerId: string;
  date: string;
  expiryDate: string;
  notes?: string;
  terms?: string;
  lines: Array<{
    itemId?: string;
    description: string;
    quantity: string;
    rate: string;
    discountPercent?: string;
    taxRateId?: string;
  }>;
}

interface UpdateQuoteData extends Partial<CreateQuoteData> {}

/**
 * Hook to fetch all quotes with pagination
 */
export function useQuotes(params?: QuoteParams) {
  return useQuery({
    queryKey: ['quotes', params],
    queryFn: async () => {
      const response = await quotesApi.getAll(params);
      return response.data;
    },
  });
}

/**
 * Hook to fetch all quotes with cursor-based pagination (virtual scroll)
 */
export function useInfiniteQuotes(params?: Record<string, unknown>) {
  return useInfiniteTableData<Quote, Record<string, unknown>>({
    queryKey: ['quotes'],
    fetchFn: async (p) => {
      const response = await quotesApi.getAllCursor(p);
      return response.data;
    },
    params: params || {},
  });
}

/**
 * Hook to fetch a single quote by ID
 */
export function useQuote(id: string | undefined) {
  return useQuery({
    queryKey: ['quotes', id],
    queryFn: async () => {
      if (!id) throw new Error('Quote ID is required');
      const response = await quotesApi.getOne(id);
      return response.data as Quote;
    },
    enabled: !!id,
  });
}

/**
 * Hook to create a new quote
 */
export function useCreateQuote() {
  return useToastMutation({
    namespace: 'sales.quotes.toast',
    mutationFn: async (data: CreateQuoteData) => (await quotesApi.create(data)).data,
    invalidate: () => [['quotes']],
    success: 'created',
    error: 'createError',
  });
}

/**
 * Hook to update an existing quote
 */
export function useUpdateQuote() {
  return useToastMutation({
    namespace: 'sales.quotes.toast',
    mutationFn: async ({ id, data }: { id: string; data: UpdateQuoteData }) =>
      (await quotesApi.update(id, data)).data,
    invalidate: (variables) => [['quotes'], ['quotes', variables.id]],
    success: 'updated',
    error: 'updateError',
  });
}

/**
 * Hook to delete a quote
 */
export function useDeleteQuote() {
  return useToastMutation({
    namespace: 'sales.quotes.toast',
    mutationFn: async (id: string) => (await quotesApi.delete(id)).data,
    invalidate: () => [['quotes']],
    success: 'deleted',
    error: 'deleteError',
  });
}

/**
 * Hook to send a quote
 */
export function useSendQuote() {
  return useToastMutation({
    namespace: 'sales.quotes.toast',
    mutationFn: async (id: string) => (await quotesApi.send(id)).data,
    invalidate: (id) => [['quotes'], ['quotes', id]],
    success: 'sent',
    error: 'sendError',
  });
}

/**
 * Hook to accept a quote
 */
export function useAcceptQuote() {
  return useToastMutation({
    namespace: 'sales.quotes.toast',
    mutationFn: async (id: string) => (await quotesApi.accept(id)).data,
    invalidate: (id) => [['quotes'], ['quotes', id]],
    success: 'accepted',
    error: 'acceptError',
  });
}

/**
 * Hook to decline a quote
 */
export function useDeclineQuote() {
  return useToastMutation({
    namespace: 'sales.quotes.toast',
    mutationFn: async (id: string) => (await quotesApi.decline(id)).data,
    invalidate: (id) => [['quotes'], ['quotes', id]],
    success: 'declined',
    error: 'declineError',
  });
}

/**
 * Hook to convert quote to invoice
 */
export function useConvertToInvoice() {
  return useToastMutation({
    namespace: 'sales.quotes.toast',
    mutationFn: async (id: string) => (await quotesApi.convertToInvoice(id)).data,
    invalidate: (id) => [['quotes'], ['quotes', id], ['invoices']],
    success: 'invoiceCreated',
    error: 'convertError',
  });
}

/**
 * Hook to clone/duplicate a quote
 */
export function useCloneQuote() {
  return useToastMutation({
    namespace: 'sales.quotes.toast',
    mutationFn: async (id: string) => (await quotesApi.clone(id)).data as Quote,
    invalidate: () => [['quotes']],
    success: 'duplicated',
    error: 'duplicateError',
  });
}
