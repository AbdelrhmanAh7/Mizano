'use client';

import { useToast } from '@/components/ui/use-toast';
import { creditNotesApi } from '@/lib/api';
import { useInfiniteTableData } from '@/lib/hooks/use-infinite-table-data';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

// Types
type ApiError = { response?: { data?: { message?: string } } };

export type CreditNoteType = 'REFUND' | 'APPLY_TO_INVOICE';

export interface CreditNote {
  id: string;
  creditNoteNumber: string;
  customerId: string;
  customer?: {
    id: string;
    name: string;
    email: string | null;
  };
  invoiceId: string;
  invoice?: {
    id: string;
    invoiceNumber: string;
    grandTotal: string;
  };
  date: string;
  type: CreditNoteType;
  amount: string;
  reason: string | null;
  appliedToInvoiceId?: string;
  appliedToInvoice?: {
    id: string;
    invoiceNumber: string;
  };
  organizationId: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface CreditNoteParams {
  page?: number;
  limit?: number;
  search?: string;
  customerId?: string;
  invoiceId?: string;
  type?: CreditNoteType;
  dateFrom?: string;
  dateTo?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

interface CreateCreditNoteData {
  customerId: string;
  invoiceId: string;
  date: string;
  type: CreditNoteType;
  amount: string;
  reason: string;
  appliedToInvoiceId?: string;
  refundAccountId?: string;
}

/**
 * Hook to fetch all credit notes with pagination
 */
export function useCreditNotes(params?: CreditNoteParams) {
  return useQuery({
    queryKey: ['credit-notes', params],
    queryFn: async () => {
      const response = await creditNotesApi.getAll(params);
      return response.data;
    },
  });
}

/**
 * Hook to fetch all credit notes with cursor-based pagination (virtual scroll)
 */
export function useInfiniteCreditNotes(params?: Record<string, unknown>) {
  return useInfiniteTableData<CreditNote, Record<string, unknown>>({
    queryKey: ['credit-notes'],
    fetchFn: async (p) => {
      const response = await creditNotesApi.getAllCursor(p);
      return response.data;
    },
    params: params || {},
  });
}

/**
 * Hook to fetch a single credit note by ID
 */
export function useCreditNote(id: string | undefined) {
  return useQuery({
    queryKey: ['credit-notes', id],
    queryFn: async () => {
      if (!id) throw new Error('Credit Note ID is required');
      const response = await creditNotesApi.getOne(id);
      return response.data as CreditNote;
    },
    enabled: !!id,
  });
}

/**
 * Hook to create a new credit note
 */
export function useCreateCreditNote() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: CreateCreditNoteData) => {
      const response = await creditNotesApi.create(data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['credit-notes'] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      toast({
        title: 'Credit note created',
        description: 'The credit note has been created successfully.',
      });
    },
    onError: (error: ApiError) => {
      toast({
        variant: 'destructive',
        title: 'Error creating credit note',
        description: error.response?.data?.message || 'An error occurred',
      });
    },
  });
}

/**
 * Get credit note type label
 */
export function getCreditNoteTypeLabel(type: CreditNoteType): string {
  const labelMap: Record<CreditNoteType, string> = {
    REFUND: 'Refund',
    APPLY_TO_INVOICE: 'Apply to Invoice',
  };
  return labelMap[type] || type;
}

/**
 * Get credit note type color
 */
export function getCreditNoteTypeColor(type: CreditNoteType): string {
  const colorMap: Record<CreditNoteType, string> = {
    REFUND: 'bg-orange-100 text-orange-800',
    APPLY_TO_INVOICE: 'bg-blue-100 text-blue-800',
  };
  return colorMap[type] || 'bg-gray-100 text-gray-800';
}
