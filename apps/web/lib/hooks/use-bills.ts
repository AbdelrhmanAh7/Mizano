'use client';

import type { DuplicateCheckResult } from '@mizano/shared-types';
import { useToast } from '@/components/ui/use-toast';
import { billsApi } from '@/lib/api';
import { decimalToDisplayNumber } from '@/lib/decimal';
import { useInfiniteTableData } from '@/lib/hooks/use-infinite-table-data';
import { invalidateLedgerQueries } from '@/lib/hooks/use-journals';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

type ApiError = { response?: { data?: { message?: string } } };

// Types — mirror the API's BillStatus enum exactly.
export type BillStatus =
  | 'DRAFT'
  | 'PENDING'
  | 'OPEN'
  | 'PARTIALLY_PAID'
  | 'PAID'
  | 'OVERDUE'
  | 'VOID';

export const BILL_STATUSES: BillStatus[] = [
  'DRAFT',
  'PENDING',
  'OPEN',
  'PARTIALLY_PAID',
  'OVERDUE',
  'PAID',
  'VOID',
];

/** Statuses the API accepts payments against (POST /payments-made). */
export const PAYABLE_BILL_STATUSES: BillStatus[] = ['OPEN', 'PARTIALLY_PAID', 'OVERDUE'];

export function isBillPayable(bill: Pick<Bill, 'status'>): boolean {
  return PAYABLE_BILL_STATUSES.includes(bill.status);
}

/** Approval posts the bill to the ledger; anything past DRAFT/PENDING has a posted journal. */
export function isBillPosted(bill: Pick<Bill, 'status'>): boolean {
  return bill.status !== 'DRAFT' && bill.status !== 'PENDING' && bill.status !== 'VOID';
}

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

export interface BillAllocationRecord {
  id: string;
  paymentId: string;
  billId: string;
  /** Decimal string */
  amount: string;
  /** The allocation's payment (deletedAt set when the payment was voided). */
  payment?: { id: string; paymentNumber: string; date: string; deletedAt: string | null };
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
    currency?: string;
  };
  lines?: BillLine[];
  /** Includes allocations of voided payments; match against live payments before display. */
  billAllocations?: BillAllocationRecord[];
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
  /** One status or a comma-separated list (e.g. "OPEN,PARTIALLY_PAID,OVERDUE"). */
  status?: string;
  hasBalance?: boolean | string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

interface CreateBillLineData {
  itemId?: string | null;
  accountId?: string | null;
  description: string;
  /** Decimal strings — the API rejects JS numbers for money. */
  quantity: string;
  rate: string;
  /** Percent as a decimal string ("" = unresolved). */
  taxRate?: string;
}

interface CreateBillData {
  vendorId: string;
  billNumber?: string;
  date: string;
  dueDate: string;
  reference?: string | null;
  currencyCode?: string | null;
  lines: CreateBillLineData[];
  notes?: string | null;
  projectId?: string | null;
}

type UpdateBillData = Partial<CreateBillData>;

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
 * Possible duplicates of a stored bill: posted bills of the same vendor with the identical
 * amount and currency within ±3 days. Advisory only; it never blocks approval.
 */
export function useBillPossibleDuplicates(id: string, enabled = true) {
  return useQuery({
    queryKey: ['bills', id, 'possible-duplicates'],
    queryFn: async (): Promise<DuplicateCheckResult> => {
      const response = await billsApi.possibleDuplicates(id);
      return response.data as DuplicateCheckResult;
    },
    enabled,
  });
}

/**
 * Hook to create a new bill
 */
export function useCreateBill() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: CreateBillData): Promise<Bill> => {
      const response = await billsApi.create(data);
      return response.data as Bill;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bills'] });
      toast({
        title: 'Bill created',
        description: 'The bill has been saved as a draft.',
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
 * Hook to approve a draft bill: POST /bills/:id/approve posts Dr expense / Dr VAT receivable /
 * Cr AP dated on the bill date. Errors (missing default accounts, locked period, already
 * approved) are surfaced by the caller with the server's message.
 */
export function useApproveBill() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string): Promise<Bill> => {
      const response = await billsApi.approve(id);
      return response.data as Bill;
    },
    onSuccess: () => invalidateLedgerQueries(queryClient),
  });
}

/**
 * @deprecated "Open" is the same accounting event as approval; use useApproveBill.
 */
export function useOpenBill() {
  return useApproveBill();
}

/**
 * Hook to delete a bill
 */
export function useDeleteBill() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const response = await billsApi.delete(id);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bills'] });
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

export type BillBadgeVariant = 'muted' | 'info' | 'warning' | 'success' | 'destructive';

const BILL_STATUS_BADGES: Record<BillStatus, { variant: BillBadgeVariant; labelKey: string }> = {
  DRAFT: { variant: 'muted', labelKey: 'draft' },
  PENDING: { variant: 'info', labelKey: 'pending' },
  OPEN: { variant: 'info', labelKey: 'open' },
  PARTIALLY_PAID: { variant: 'warning', labelKey: 'partiallyPaid' },
  OVERDUE: { variant: 'destructive', labelKey: 'overdue' },
  PAID: { variant: 'success', labelKey: 'paid' },
  VOID: { variant: 'muted', labelKey: 'void' },
};

/**
 * Badge variant and i18n key (under purchases.bills.status) for a bill status, following the
 * design-system accounting status mapping.
 */
export function getBillStatusBadge(status: string): {
  variant: BillBadgeVariant;
  labelKey: string;
} {
  return BILL_STATUS_BADGES[status as BillStatus] ?? { variant: 'muted', labelKey: 'unknown' };
}

/**
 * Get status badge variant
 */
export function getStatusVariant(status: BillStatus | string): BillBadgeVariant {
  return getBillStatusBadge(status).variant;
}

/**
 * Get status display text (English fallback; prefer t(`bills.status.${labelKey}`))
 */
export function getStatusText(status: BillStatus | string): string {
  const labels: Record<string, string> = {
    DRAFT: 'Draft',
    PENDING: 'Pending',
    OPEN: 'Open',
    PARTIALLY_PAID: 'Partially Paid',
    OVERDUE: 'Overdue',
    PAID: 'Paid',
    VOID: 'Void',
  };
  return labels[status] ?? status;
}

/**
 * Format currency amount (display only; value stays a decimal string elsewhere)
 */
export function formatCurrency(
  amount: string | number,
  currency: string = 'USD',
  locale = 'en-US',
): string {
  const num = typeof amount === 'string' ? decimalToDisplayNumber(amount) : amount;
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
  }).format(Number.isFinite(num) ? num : 0);
}
