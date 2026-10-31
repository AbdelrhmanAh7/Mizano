'use client';

import { invoicesApi } from '@/lib/api';
import { useInfiniteTableData } from '@/lib/hooks/use-infinite-table-data';
import { useToastMutation } from '@/lib/hooks/use-toast-mutation';
import { useQuery } from '@tanstack/react-query';

// Types

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
  /** Null means the organization base currency. */
  currencyCode?: string | null;
  notes: string | null;
  terms: string | null;
  /** The customer's reference, such as their purchase order number. */
  reference?: string | null;
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
  /** Only posted invoices with a balance due (payment allocation, credit application). */
  open?: boolean;
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

const INVOICE_TOAST = 'sales.invoices.toast';

/**
 * Hook to create a new invoice
 */
export function useCreateInvoice() {
  return useToastMutation({
    namespace: INVOICE_TOAST,
    mutationFn: async (data: CreateInvoiceData) => (await invoicesApi.create(data)).data,
    invalidate: () => [['invoices'], ['customers']],
    success: 'created',
    error: 'createError',
  });
}

/**
 * Hook to update an existing invoice
 */
export function useUpdateInvoice() {
  return useToastMutation({
    namespace: INVOICE_TOAST,
    mutationFn: async ({ id, data }: { id: string; data: UpdateInvoiceData }) =>
      (await invoicesApi.update(id, data)).data,
    invalidate: ({ id }) => [['invoices'], ['invoices', id]],
    success: 'updated',
    error: 'updateError',
  });
}

/**
 * Hook to delete an invoice
 */
export function useDeleteInvoice() {
  return useToastMutation({
    namespace: INVOICE_TOAST,
    mutationFn: async (id: string) => (await invoicesApi.delete(id)).data,
    invalidate: () => [['invoices'], ['customers']],
    success: 'deleted',
    error: 'deleteError',
  });
}

/**
 * Hook to send an invoice
 */
export function useSendInvoice() {
  return useToastMutation({
    namespace: INVOICE_TOAST,
    mutationFn: async (id: string) => (await invoicesApi.send(id)).data,
    invalidate: (id) => [['invoices'], ['invoices', id], ['customers']],
    success: 'sent',
    error: 'sendError',
  });
}

/**
 * Hook to void an invoice
 */
export function useVoidInvoice() {
  return useToastMutation({
    namespace: INVOICE_TOAST,
    mutationFn: async (id: string) => (await invoicesApi.void(id)).data,
    invalidate: (id) => [['invoices'], ['invoices', id], ['customers']],
    success: 'voided',
    error: 'voidError',
  });
}

/**
 * Hook to clone/duplicate an invoice
 */
export function useCloneInvoice() {
  return useToastMutation({
    namespace: INVOICE_TOAST,
    mutationFn: async (id: string) => (await invoicesApi.clone(id)).data as Invoice,
    invalidate: () => [['invoices']],
    success: 'duplicated',
    error: 'duplicateError',
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
