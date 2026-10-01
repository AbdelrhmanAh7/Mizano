'use client';

import { useToast } from '@/components/ui/use-toast';
import { invoicesApi } from '@/lib/api';
import { useInfiniteTableData } from '@/lib/hooks/use-infinite-table-data';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

// Types
type ApiError = { response?: { data?: { message?: string } } };

export type InvoiceStatus = 'DRAFT' | 'SENT' | 'PARTIALLY_PAID' | 'PAID' | 'OVERDUE' | 'VOID';

export interface InvoiceLine {
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

export interface Invoice {
  id: string;
  invoiceNumber: string;
  customerId: string;
  customer?: {
    id: string;
    name: string;
    email: string | null;
  };
  quoteId?: string;
  projectId?: string;
  date: string;
  dueDate: string;
  status: InvoiceStatus;
  subtotal: string;
  taxAmount: string;
  shippingAmount: string;
  grandTotal: string;
  balanceDue: string;
  notes: string | null;
  terms: string | null;
  lines: InvoiceLine[];
  payments?: Array<{
    id: string;
    paymentNumber: string;
    date: string;
    amount: string;
  }>;
  organizationId: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface InvoiceParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: InvoiceStatus;
  customerId?: string;
  dateFrom?: string;
  dateTo?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

interface CreateInvoiceData {
  customerId: string;
  quoteId?: string;
  projectId?: string;
  date: string;
  dueDate: string;
  shippingAmount?: string;
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

interface UpdateInvoiceData extends Partial<CreateInvoiceData> {}

/**
 * Hook to fetch all invoices with pagination
 */
export function useInvoices(params?: InvoiceParams) {
  return useQuery({
    queryKey: ['invoices', params],
    queryFn: async () => {
      const response = await invoicesApi.getAll(params);
      return response.data;
    },
  });
}

/**
 * Hook to fetch all invoices with cursor-based pagination (virtual scroll)
 */
export function useInfiniteInvoices(params?: Record<string, unknown>) {
  return useInfiniteTableData<Invoice, Record<string, unknown>>({
    queryKey: ['invoices'],
    fetchFn: async (p) => {
      const response = await invoicesApi.getAllCursor(p);
      return response.data;
    },
    params: params || {},
  });
}

/**
 * Hook to fetch a single invoice by ID
 */
export function useInvoice(id: string | undefined) {
  return useQuery({
    queryKey: ['invoices', id],
    queryFn: async () => {
      if (!id) throw new Error('Invoice ID is required');
      const response = await invoicesApi.getOne(id);
      return response.data as Invoice;
    },
    enabled: !!id,
  });
}

/**
 * Hook to create a new invoice
 */
export function useCreateInvoice() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: CreateInvoiceData) => {
      const response = await invoicesApi.create(data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      toast({
        title: 'Invoice created',
        description: 'The invoice has been created successfully.',
      });
    },
    onError: (error: ApiError) => {
      toast({
        variant: 'destructive',
        title: 'Error creating invoice',
        description: error.response?.data?.message || 'An error occurred',
      });
    },
  });
}

/**
 * Hook to update an existing invoice
 */
export function useUpdateInvoice() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateInvoiceData }) => {
      const response = await invoicesApi.update(id, data);
      return response.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['invoices', variables.id] });
      toast({
        title: 'Invoice updated',
        description: 'The invoice has been updated successfully.',
      });
    },
    onError: (error: ApiError) => {
      toast({
        variant: 'destructive',
        title: 'Error updating invoice',
        description: error.response?.data?.message || 'An error occurred',
      });
    },
  });
}

/**
 * Hook to delete an invoice
 */
export function useDeleteInvoice() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: string) => {
      const response = await invoicesApi.delete(id);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      toast({
        title: 'Invoice deleted',
        description: 'The invoice has been deleted successfully.',
      });
    },
    onError: (error: ApiError) => {
      toast({
        variant: 'destructive',
        title: 'Error deleting invoice',
        description: error.response?.data?.message || 'An error occurred',
      });
    },
  });
}

/**
 * Hook to send an invoice
 */
export function useSendInvoice() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: string) => {
      const response = await invoicesApi.send(id);
      return response.data;
    },
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['invoices', id] });
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      toast({
        title: 'Invoice sent',
        description: 'The invoice has been sent successfully.',
      });
    },
    onError: (error: ApiError) => {
      toast({
        variant: 'destructive',
        title: 'Error sending invoice',
        description: error.response?.data?.message || 'An error occurred',
      });
    },
  });
}

/**
 * Hook to void an invoice
 */
export function useVoidInvoice() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: string) => {
      const response = await invoicesApi.void(id);
      return response.data;
    },
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['invoices', id] });
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      toast({
        title: 'Invoice voided',
        description: 'The invoice has been voided successfully.',
      });
    },
    onError: (error: ApiError) => {
      toast({
        variant: 'destructive',
        title: 'Error voiding invoice',
        description: error.response?.data?.message || 'An error occurred',
      });
    },
  });
}

/**
 * Hook to clone/duplicate an invoice
 */
export function useCloneInvoice() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: string) => {
      const response = await invoicesApi.clone(id);
      return response.data as Invoice;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      toast({
        title: 'Invoice duplicated',
        description: 'A new draft copy has been created.',
      });
    },
    onError: (error: ApiError) => {
      toast({
        variant: 'destructive',
        title: 'Error duplicating invoice',
        description: error.response?.data?.message || 'An error occurred',
      });
    },
  });
}

/**
 * Get invoice status color
 */
export function getInvoiceStatusColor(status: InvoiceStatus): string {
  const colorMap: Record<InvoiceStatus, string> = {
    DRAFT: 'bg-gray-100 text-gray-800',
    SENT: 'bg-blue-100 text-blue-800',
    PARTIALLY_PAID: 'bg-yellow-100 text-yellow-800',
    PAID: 'bg-green-100 text-green-800',
    OVERDUE: 'bg-red-100 text-red-800',
    VOID: 'bg-gray-100 text-gray-500',
  };
  return colorMap[status] || 'bg-gray-100 text-gray-800';
}

/**
 * Get invoice status label
 */
export function getInvoiceStatusLabel(status: InvoiceStatus): string {
  const labelMap: Record<InvoiceStatus, string> = {
    DRAFT: 'Draft',
    SENT: 'Sent',
    PARTIALLY_PAID: 'Partially Paid',
    PAID: 'Paid',
    OVERDUE: 'Overdue',
    VOID: 'Void',
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

/**
 * Calculate invoice totals
 */
export function calculateInvoiceTotals(
  lines: Array<{ amount: string; taxRateId?: string }>,
  taxRates: Array<{ id: string; rate: number }>,
  shippingAmount: string = '0',
): { subtotal: number; taxAmount: number; grandTotal: number } {
  const subtotal = lines.reduce((sum, line) => sum + (parseFloat(line.amount) || 0), 0);

  const taxAmount = lines.reduce((sum, line) => {
    const taxRate = taxRates.find((t) => t.id === line.taxRateId);
    return sum + (parseFloat(line.amount) || 0) * ((taxRate?.rate || 0) / 100);
  }, 0);

  const shipping = parseFloat(shippingAmount) || 0;
  const grandTotal = subtotal + taxAmount + shipping;

  return { subtotal, taxAmount, grandTotal };
}

/**
 * Format currency amount
 */
export function formatAmount(amount: string | number): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
}
