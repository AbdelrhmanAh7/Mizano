'use client';

import { useToast } from '@/components/ui/use-toast';
import { billsApi } from '@/lib/api';
import { useInfiniteTableData } from '@/lib/hooks/use-infinite-table-data';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

type ApiError = { response?: { data?: { message?: string } } };

// Types
export type BillStatus = 'DRAFT' | 'OPEN' | 'OVERDUE' | 'PARTIAL' | 'PAID' | 'VOID';

export interface BillLine {
  id?: string;
  itemId?: string | null;
  accountId?: string | null;
  description: string;
  quantity: number | string;
  rate: number | string;
  taxRate?: number | string;
  amount?: number | string;
  item?: {
    id: string;
    name: string;
    sku: string;
  } | null;
  account?: {
    id: string;
    code: string;
    name: string;
  } | null;
}

export interface Bill {
  id: string;
  billNumber: string;
  vendorId: string;
  date: string;
  dueDate: string;
  status: BillStatus;
  subtotal: string;
  taxAmount: string;
  grandTotal: string;
  balanceDue: string;
  reference: string | null;
  currencyCode: string | null;
  notes: string | null;
  projectId: string | null;
  organizationId: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  // Relations
  vendor?: {
    id: string;
    name: string;
    currency: string;
  };
  lines?: BillLine[];
  project?: {
    id: string;
    name: string;
  } | null;
}

export interface BillParams {
  page?: number;
  limit?: number;
  search?: string;
  vendorId?: string;
  status?: BillStatus;
  startDate?: string;
  endDate?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

interface CreateBillData {
  vendorId: string;
  date: string;
  dueDate: string;
  lines: Array<{
    itemId?: string | null;
    accountId?: string | null;
    description: string;
    quantity: number;
    rate: number;
    taxRate?: number;
  }>;
  notes?: string | null;
  projectId?: string | null;
}

interface UpdateBillData extends Partial<CreateBillData> {}

/**
 * Hook to fetch all bills with pagination
 */
export function useBills(params?: BillParams) {
  return useQuery({
    queryKey: ['bills', params],
    queryFn: async () => {
      const response = await billsApi.getAll(params);
      return response.data;
    },
  });
}

/**
 * Hook to fetch all bills with cursor-based pagination (virtual scroll)
 */
export function useInfiniteBills(params?: Record<string, unknown>) {
  return useInfiniteTableData<Bill, Record<string, unknown>>({
    queryKey: ['bills'],
    fetchFn: async (p) => {
      const response = await billsApi.getAllCursor(p);
      return response.data;
    },
    params: params || {},
  });
}

/**
 * Hook to fetch a single bill by ID
 */
export function useBill(id: string | undefined) {
  return useQuery({
    queryKey: ['bills', id],
    queryFn: async () => {
      if (!id) throw new Error('Bill ID is required');
      const response = await billsApi.getOne(id);
      return response.data as Bill;
    },
    enabled: !!id,
  });
}

/**
 * Hook to create a new bill
 */
export function useCreateBill() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: CreateBillData) => {
      const response = await billsApi.create(data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bills'] });
      toast({
        title: 'Bill created',
        description: 'The bill has been created successfully.',
      });
    },
    onError: (error: ApiError) => {
      toast({
        variant: 'destructive',
        title: 'Error creating bill',
        description: error.response?.data?.message || 'An error occurred',
      });
    },
  });
}

/**
 * Hook to update an existing bill
 */
export function useUpdateBill() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateBillData }) => {
      const response = await billsApi.update(id, data);
      return response.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['bills'] });
      queryClient.invalidateQueries({ queryKey: ['bills', variables.id] });
      toast({
        title: 'Bill updated',
        description: 'The bill has been updated successfully.',
      });
    },
    onError: (error: ApiError) => {
      toast({
        variant: 'destructive',
        title: 'Error updating bill',
        description: error.response?.data?.message || 'An error occurred',
      });
    },
  });
}

/**
 * Hook to open a bill (change status from DRAFT to OPEN)
 */
export function useOpenBill() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: string) => {
      const response = await billsApi.open(id);
      return response.data;
    },
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['bills'] });
      queryClient.invalidateQueries({ queryKey: ['bills', id] });
      toast({
        title: 'Bill opened',
        description: 'The bill is now open and ready for payment.',
      });
    },
    onError: (error: ApiError) => {
      toast({
        variant: 'destructive',
        title: 'Error opening bill',
        description: error.response?.data?.message || 'An error occurred',
      });
    },
  });
}

/**
 * Hook to delete a bill
 */
export function useDeleteBill() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: string) => {
      const response = await billsApi.delete(id);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bills'] });
      toast({
        title: 'Bill deleted',
        description: 'The bill has been deleted successfully.',
      });
    },
    onError: (error: ApiError) => {
      toast({
        variant: 'destructive',
        title: 'Error deleting bill',
        description: error.response?.data?.message || 'An error occurred',
      });
    },
  });
}

/**
 * Hook to clone a bill
 */
export function useCloneBill() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: string) => {
      const response = await billsApi.clone(id);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bills'] });
      toast({
        title: 'Bill duplicated',
        description: 'A new draft copy has been created.',
      });
    },
    onError: (error: ApiError) => {
      toast({
        variant: 'destructive',
        title: 'Error duplicating bill',
        description: error.response?.data?.message || 'An error occurred',
      });
    },
  });
}

/**
 * Get status badge variant
 */
export function getStatusVariant(
  status: BillStatus,
): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case 'DRAFT':
      return 'secondary';
    case 'OPEN':
      return 'default';
    case 'OVERDUE':
      return 'destructive';
    case 'PARTIAL':
      return 'outline';
    case 'PAID':
      return 'default';
    case 'VOID':
      return 'secondary';
    default:
      return 'secondary';
  }
}

/**
 * Get status display text
 */
export function getStatusText(status: BillStatus): string {
  switch (status) {
    case 'DRAFT':
      return 'Draft';
    case 'OPEN':
      return 'Open';
    case 'OVERDUE':
      return 'Overdue';
    case 'PARTIAL':
      return 'Partial';
    case 'PAID':
      return 'Paid';
    case 'VOID':
      return 'Void';
    default:
      return status;
  }
}

/**
 * Format currency amount
 */
export function formatCurrency(amount: string | number, currency: string = 'USD'): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(num);
}
