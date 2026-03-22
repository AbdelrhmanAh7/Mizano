'use client';

import { useToast } from '@/components/ui/use-toast';
import { journalsApi } from '@/lib/api';
import { useInfiniteTableData } from '@/lib/hooks/use-infinite-table-data';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

// Types
type ApiError = { response?: { data?: { message?: string } } };

export type JournalStatus = 'DRAFT' | 'POSTED' | 'VOIDED';

export interface JournalLine {
  id?: string;
  accountId: string;
  debit: string;
  credit: string;
  description?: string;
  account?: {
    id: string;
    code: string;
    name: string;
    type: string;
  };
}

export interface Journal {
  id: string;
  journalNumber: string;
  date: string;
  entryDate: string; // alias for date
  reference: string | null;
  notes: string | null;
  description: string | null; // alias for notes
  isPosted: boolean;
  status: JournalStatus; // computed from isPosted/deletedAt
  organizationId: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  lines: JournalLine[];
  totalDebit?: number;
  totalCredit?: number;
}

export interface JournalParams {
  page?: number;
  limit?: number;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  isPosted?: boolean;
  status?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

interface CreateJournalData {
  date: string;
  reference?: string;
  notes?: string;
  lines: Array<{
    accountId: string;
    debit: string;
    credit: string;
    description?: string;
  }>;
}

interface UpdateJournalData {
  date?: string;
  reference?: string;
  notes?: string;
  lines?: Array<{
    accountId: string;
    debit: string;
    credit: string;
    description?: string;
  }>;
}

type RawJournal = Omit<Journal, 'entryDate' | 'description' | 'status'>;

/**
 * Transform raw journal data to include computed fields
 */
function transformJournal(journal: RawJournal): Journal {
  const status: JournalStatus = journal.deletedAt
    ? 'VOIDED'
    : journal.isPosted
      ? 'POSTED'
      : 'DRAFT';

  return {
    ...journal,
    entryDate: journal.date, // alias
    description: journal.notes, // alias
    status,
  };
}

/**
 * Hook to fetch all journals with pagination
 */
export function useJournals(params?: JournalParams) {
  return useQuery({
    queryKey: ['journals', params],
    queryFn: async () => {
      // Convert status to isPosted for API
      const apiParams = { ...params };
      if (params?.status === 'DRAFT') {
        apiParams.isPosted = false;
        delete apiParams.status;
      } else if (params?.status === 'POSTED') {
        apiParams.isPosted = true;
        delete apiParams.status;
      }

      const response = await journalsApi.getAll(apiParams);
      const data = response.data;

      // Transform journals to include computed status
      if (data.data) {
        data.data = data.data.map(transformJournal);
      }

      return data;
    },
  });
}

/**
 * Hook to fetch all journals with cursor-based infinite scrolling
 */
export function useInfiniteJournals(params?: Record<string, unknown>) {
  return useInfiniteTableData<Journal, Record<string, unknown>>({
    queryKey: ['journals'],
    fetchFn: async (p) => {
      const response = await journalsApi.getAllCursor(p);
      const page = response.data;
      if (page.data) {
        page.data = page.data.map(transformJournal);
      }
      return page;
    },
    params: params || {},
  });
}

/**
 * Hook to fetch a single journal by ID
 */
export function useJournal(id: string | undefined) {
  return useQuery({
    queryKey: ['journals', id],
    queryFn: async () => {
      if (!id) throw new Error('Journal ID is required');
      const response = await journalsApi.getOne(id);
      return transformJournal(response.data);
    },
    enabled: !!id,
  });
}

/**
 * Hook to create a new journal
 */
export function useCreateJournal() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: CreateJournalData) => {
      const response = await journalsApi.create(data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['journals'] });
      toast({
        title: 'Journal created',
        description: 'The journal entry has been created successfully.',
      });
    },
    onError: (error: ApiError) => {
      toast({
        variant: 'destructive',
        title: 'Error creating journal',
        description: error.response?.data?.message || 'An error occurred',
      });
    },
  });
}

/**
 * Hook to update an existing journal
 */
export function useUpdateJournal() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateJournalData }) => {
      const response = await journalsApi.update(id, data);
      return response.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['journals'] });
      queryClient.invalidateQueries({ queryKey: ['journals', variables.id] });
      toast({
        title: 'Journal updated',
        description: 'The journal entry has been updated successfully.',
      });
    },
    onError: (error: ApiError) => {
      toast({
        variant: 'destructive',
        title: 'Error updating journal',
        description: error.response?.data?.message || 'An error occurred',
      });
    },
  });
}

/**
 * Hook to delete a journal
 */
export function useDeleteJournal() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: string) => {
      const response = await journalsApi.delete(id);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['journals'] });
      toast({
        title: 'Journal deleted',
        description: 'The journal entry has been deleted successfully.',
      });
    },
    onError: (error: ApiError) => {
      toast({
        variant: 'destructive',
        title: 'Error deleting journal',
        description: error.response?.data?.message || 'An error occurred',
      });
    },
  });
}

/**
 * Hook to post a journal (mark as posted)
 */
export function usePostJournal() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: string) => {
      const response = await journalsApi.post(id);
      return response.data;
    },
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['journals'] });
      queryClient.invalidateQueries({ queryKey: ['journals', id] });
      toast({
        title: 'Journal posted',
        description: 'The journal entry has been posted successfully.',
      });
    },
    onError: (error: ApiError) => {
      toast({
        variant: 'destructive',
        title: 'Error posting journal',
        description: error.response?.data?.message || 'An error occurred',
      });
    },
  });
}

/**
 * Calculate totals from journal lines
 */
export function calculateJournalTotals(lines: Array<{ debit: string; credit: string }>) {
  const totalDebit = lines.reduce((sum, line) => sum + parseFloat(line.debit || '0'), 0);
  const totalCredit = lines.reduce((sum, line) => sum + parseFloat(line.credit || '0'), 0);
  const difference = Math.abs(totalDebit - totalCredit);
  const isBalanced = difference < 0.0001;

  return {
    totalDebit,
    totalCredit,
    difference,
    isBalanced,
  };
}

/**
 * Format currency for display
 */
export function formatJournalAmount(amount: number | string): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
}

/**
 * Get status color based on journal status
 */
export function getStatusColor(status: JournalStatus): string {
  const colorMap: Record<JournalStatus, string> = {
    DRAFT: 'bg-yellow-100 text-yellow-800',
    POSTED: 'bg-green-100 text-green-800',
    VOIDED: 'bg-red-100 text-red-800',
  };
  return colorMap[status] || 'bg-gray-100 text-gray-800';
}

/**
 * Get journal status display (legacy support)
 */
export function getJournalStatus(journal: Journal): { label: string; color: string } {
  return {
    label: journal.status,
    color: getStatusColor(journal.status),
  };
}
