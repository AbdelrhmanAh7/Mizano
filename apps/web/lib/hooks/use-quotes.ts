'use client';

import { useToast } from '@/components/ui/use-toast';
import { quotesApi } from '@/lib/api';
import { useInfiniteTableData } from '@/lib/hooks/use-infinite-table-data';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

// Types
type ApiError = { response?: { data?: { message?: string } } };

export type QuoteStatus = 'DRAFT' | 'SENT' | 'ACCEPTED' | 'INVOICED' | 'DECLINED' | 'EXPIRED';

export interface QuoteLine {
  id?: string;
  itemId?: string;
  description: string;
  quantity: string;
  rate: string;
  discountPercent?: string;
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
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: CreateQuoteData) => {
      const response = await quotesApi.create(data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quotes'] });
      toast({
        title: 'Quote created',
        description: 'The quote has been created successfully.',
      });
    },
    onError: (error: ApiError) => {
      toast({
        variant: 'destructive',
        title: 'Error creating quote',
        description: error.response?.data?.message || 'An error occurred',
      });
    },
  });
}

/**
 * Hook to update an existing quote
 */
export function useUpdateQuote() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateQuoteData }) => {
      const response = await quotesApi.update(id, data);
      return response.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['quotes'] });
      queryClient.invalidateQueries({ queryKey: ['quotes', variables.id] });
      toast({
        title: 'Quote updated',
        description: 'The quote has been updated successfully.',
      });
    },
    onError: (error: ApiError) => {
      toast({
        variant: 'destructive',
        title: 'Error updating quote',
        description: error.response?.data?.message || 'An error occurred',
      });
    },
  });
}

/**
 * Hook to delete a quote
 */
export function useDeleteQuote() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: string) => {
      const response = await quotesApi.delete(id);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quotes'] });
      toast({
        title: 'Quote deleted',
        description: 'The quote has been deleted successfully.',
      });
    },
    onError: (error: ApiError) => {
      toast({
        variant: 'destructive',
        title: 'Error deleting quote',
        description: error.response?.data?.message || 'An error occurred',
      });
    },
  });
}

/**
 * Hook to send a quote
 */
export function useSendQuote() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: string) => {
      const response = await quotesApi.send(id);
      return response.data;
    },
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['quotes'] });
      queryClient.invalidateQueries({ queryKey: ['quotes', id] });
      toast({
        title: 'Quote sent',
        description: 'The quote has been sent successfully.',
      });
    },
    onError: (error: ApiError) => {
      toast({
        variant: 'destructive',
        title: 'Error sending quote',
        description: error.response?.data?.message || 'An error occurred',
      });
    },
  });
}

/**
 * Hook to accept a quote
 */
export function useAcceptQuote() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: string) => {
      const response = await quotesApi.accept(id);
      return response.data;
    },
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['quotes'] });
      queryClient.invalidateQueries({ queryKey: ['quotes', id] });
      toast({
        title: 'Quote accepted',
        description: 'The quote has been marked as accepted.',
      });
    },
    onError: (error: ApiError) => {
      toast({
        variant: 'destructive',
        title: 'Error accepting quote',
        description: error.response?.data?.message || 'An error occurred',
      });
    },
  });
}

/**
 * Hook to decline a quote
 */
export function useDeclineQuote() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: string) => {
      const response = await quotesApi.decline(id);
      return response.data;
    },
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['quotes'] });
      queryClient.invalidateQueries({ queryKey: ['quotes', id] });
      toast({
        title: 'Quote declined',
        description: 'The quote has been marked as declined.',
      });
    },
    onError: (error: ApiError) => {
      toast({
        variant: 'destructive',
        title: 'Error declining quote',
        description: error.response?.data?.message || 'An error occurred',
      });
    },
  });
}

/**
 * Hook to convert quote to invoice
 */
export function useConvertToInvoice() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: string) => {
      const response = await quotesApi.convertToInvoice(id);
      return response.data;
    },
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['quotes'] });
      queryClient.invalidateQueries({ queryKey: ['quotes', id] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      toast({
        title: 'Quote converted',
        description: 'The quote has been converted to an invoice.',
      });
    },
    onError: (error: ApiError) => {
      toast({
        variant: 'destructive',
        title: 'Error converting quote',
        description: error.response?.data?.message || 'An error occurred',
      });
    },
  });
}

/**
 * Get quote status color
 */
export function getQuoteStatusColor(status: QuoteStatus): string {
  const colorMap: Record<QuoteStatus, string> = {
    DRAFT: 'bg-gray-100 text-gray-800',
    SENT: 'bg-blue-100 text-blue-800',
    ACCEPTED: 'bg-green-100 text-green-800',
    INVOICED: 'bg-purple-100 text-purple-800',
    DECLINED: 'bg-red-100 text-red-800',
    EXPIRED: 'bg-orange-100 text-orange-800',
  };
  return colorMap[status] || 'bg-gray-100 text-gray-800';
}

/**
 * Get quote status label
 */
export function getQuoteStatusLabel(status: QuoteStatus): string {
  const labelMap: Record<QuoteStatus, string> = {
    DRAFT: 'Draft',
    SENT: 'Sent',
    ACCEPTED: 'Accepted',
    INVOICED: 'Invoiced',
    DECLINED: 'Declined',
    EXPIRED: 'Expired',
  };
  return labelMap[status] || status;
}

/**
 * Calculate line amount
 */
export function calculateLineAmount(
  quantity: string,
  rate: string,
  discountPercent: string = '0',
): string {
  const qty = parseFloat(quantity) || 0;
  const r = parseFloat(rate) || 0;
  const discount = parseFloat(discountPercent) || 0;
  return (qty * r * (1 - discount / 100)).toFixed(2);
}
