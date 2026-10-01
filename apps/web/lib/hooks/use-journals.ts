'use client';

import { useToast } from '@/components/ui/use-toast';
import { journalsApi } from '@/lib/api';
import { absDecimal, compareDecimals, decimalToDisplayNumber, sumDecimals } from '@/lib/decimal';
import { useInfiniteTableData } from '@/lib/hooks/use-infinite-table-data';
import { type QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

// Types
type ApiError = { response?: { data?: { message?: string } } };

export type JournalStatus = 'DRAFT' | 'POSTED' | 'VOIDED';

/** Business events that post journals (mirrors the API's JournalSourceType). */
export type JournalSourceType =
  | 'BILL_APPROVAL'
  | 'PAYMENT_MADE'
  | 'PAYMENT_MADE_VOID'
  | 'INVOICE_SEND'
  | 'INVOICE_VOID'
  | 'PAYMENT_RECEIVED'
  | 'PAYMENT_RECEIVED_VOID'
  | 'CREDIT_NOTE'
  | 'EXPENSE'
  | 'VENDOR_CREDIT'
  | 'VAT_RETURN'
  | 'INVENTORY_ADJUSTMENT'
  | 'OPENING_BALANCE';

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
  /** Decimal strings computed by the API. */
  totalDebit?: string;
  totalCredit?: string;
  /** Business event that produced this journal (null for manual entries). */
  sourceType?: JournalSourceType | string | null;
  sourceId?: string | null;
  /** Set on a reversal journal: the journal it reverses. */
  reversalOfId?: string | null;
}

export interface JournalParams {
  page?: number;
  limit?: number;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
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
export function transformJournal(journal: RawJournal): Journal {
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
 * Hook to fetch all journals with pagination.
 * The API filters by search and date only (no status filter; unknown params are rejected).
 */
export function useJournals(params?: JournalParams) {
  return useQuery({
    queryKey: ['journals', params],
    queryFn: async () => {
      const response = await journalsApi.getAll(params);
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
      void invalidateLedgerQueries(queryClient);
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
 * Hook to update an existing journal (manual drafts only; the API rejects posted/system ones)
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
 * Hook to delete a journal (manual drafts only). Toasts are left to the caller.
 */
export function useDeleteJournal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const response = await journalsApi.delete(id);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['journals'] });
    },
  });
}

/**
 * Hook to post a journal (mark as posted). Toasts are left to the caller.
 */
export function usePostJournal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const response = await journalsApi.post(id);
      return response.data;
    },
    onSuccess: () => invalidateLedgerQueries(queryClient),
  });
}

/**
 * Hook to reverse a posted journal. Resolves with the new reversal journal.
 * Toasts are left to the caller (translated messages).
 */
export function useReverseJournal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, date }: { id: string; date?: string }): Promise<Journal> => {
      const response = await journalsApi.reverse(id, date ? { date } : undefined);
      return transformJournal(response.data as RawJournal);
    },
    onSuccess: () => invalidateLedgerQueries(queryClient),
  });
}

/**
 * Exact totals of journal lines (decimal strings, BigInt arithmetic — never floats).
 */
export function calculateJournalTotals(lines: Array<{ debit?: string; credit?: string }>): {
  totalDebit: string;
  totalCredit: string;
  difference: string;
  isBalanced: boolean;
} {
  const totalDebit = sumDecimals(lines.map((l) => l.debit || '0'));
  const totalCredit = sumDecimals(lines.map((l) => l.credit || '0'));
  return {
    totalDebit,
    totalCredit,
    difference: absDecimal(sumDecimals([totalDebit, `-${totalCredit}`])),
    isBalanced: compareDecimals(totalDebit, totalCredit) === 0,
  };
}

/**
 * Format a journal amount for display (2 decimals). Display only — never use for arithmetic.
 */
export function formatJournalAmount(amount: number | string, locale = 'en-US'): string {
  const num = typeof amount === 'string' ? decimalToDisplayNumber(amount) : amount;
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(num) ? num : 0);
}

/**
 * Get status color based on journal status
 */
export function getStatusColor(status: JournalStatus): string {
  const colorMap: Record<JournalStatus, string> = {
    DRAFT: 'border-border bg-muted text-muted-foreground',
    POSTED: 'border-success/20 bg-success/10 text-success',
    VOIDED: 'border-border bg-muted text-muted-foreground line-through',
  };
  return colorMap[status] || 'border-border bg-muted text-muted-foreground';
}

/** Badge variant for a journal status (design-system tokens). */
export function getJournalStatusVariant(status: JournalStatus): 'muted' | 'success' {
  return status === 'POSTED' ? 'success' : 'muted';
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

// ---------------------------------------------------------------------------
// Posting rules (mirror the API: posted history is immutable)
// ---------------------------------------------------------------------------

type JournalPostingState = Pick<Journal, 'isPosted' | 'deletedAt'> & {
  sourceType?: string | null;
  reversalOfId?: string | null;
};

/** Manual, unposted journals are the only ones that may be edited, posted or deleted. */
export function isJournalEditable(journal: JournalPostingState): boolean {
  return !journal.isPosted && !journal.sourceType && !journal.deletedAt;
}

/** True for journals generated by a business document (bill, payment, invoice, ...). */
export function isSystemJournal(journal: { sourceType?: string | null }): boolean {
  return !!journal.sourceType;
}

/**
 * Posted journals are corrected by a linked reversal. A reversal itself cannot be reversed;
 * the API also rejects journals that were already reversed.
 */
export function canReverseJournal(journal: JournalPostingState): boolean {
  return journal.isPosted && !journal.reversalOfId && !journal.deletedAt;
}

export interface JournalSourceInfo {
  /** i18n key under accounting.journals.source */
  labelKey: string;
  /** Link to the source document when one exists. */
  href?: string;
}

const SOURCE_LINKS: Partial<Record<JournalSourceType, (id: string) => string>> = {
  BILL_APPROVAL: (id) => `/purchases/bills/${id}`,
  PAYMENT_MADE: (id) => `/purchases/payments/${id}`,
  INVOICE_SEND: (id) => `/sales/invoices/${id}`,
  INVOICE_VOID: (id) => `/sales/invoices/${id}`,
  PAYMENT_RECEIVED: (id) => `/sales/payments/${id}`,
  CREDIT_NOTE: (id) => `/sales/credit-notes/${id}`,
  EXPENSE: (id) => `/purchases/expenses/${id}`,
  VENDOR_CREDIT: (id) => `/purchases/credits/${id}`,
};

const SOURCE_LABEL_KEYS: Record<JournalSourceType, string> = {
  BILL_APPROVAL: 'billApproval',
  PAYMENT_MADE: 'paymentMade',
  PAYMENT_MADE_VOID: 'paymentMadeVoid',
  INVOICE_SEND: 'invoice',
  INVOICE_VOID: 'invoiceVoid',
  PAYMENT_RECEIVED: 'paymentReceived',
  PAYMENT_RECEIVED_VOID: 'paymentReceivedVoid',
  CREDIT_NOTE: 'creditNote',
  EXPENSE: 'expense',
  VENDOR_CREDIT: 'vendorCredit',
  VAT_RETURN: 'vatReturn',
  INVENTORY_ADJUSTMENT: 'inventoryAdjustment',
  OPENING_BALANCE: 'openingBalance',
};

/** Label key (under accounting.journals.source) and source-document link for a journal. */
export function getJournalSourceInfo(journal: {
  sourceType?: string | null;
  sourceId?: string | null;
  reversalOfId?: string | null;
}): JournalSourceInfo {
  const type = journal.sourceType as JournalSourceType | null | undefined;
  if (type && type in SOURCE_LABEL_KEYS) {
    const link = SOURCE_LINKS[type];
    return {
      labelKey: SOURCE_LABEL_KEYS[type],
      href: link && journal.sourceId ? link(journal.sourceId) : undefined,
    };
  }
  if (type) return { labelKey: 'system' };
  return { labelKey: journal.reversalOfId ? 'reversal' : 'manual' };
}

// ---------------------------------------------------------------------------
// Ledger cache invalidation
// ---------------------------------------------------------------------------

/** Every query whose data changes when something is posted to (or reversed in) the ledger. */
export const LEDGER_QUERY_KEYS: string[][] = [
  ['bills'],
  ['payments-made'],
  ['vendors'],
  ['journals'],
  ['accounts'],
  ['accounting-reports'],
  ['reports'],
  ['dashboard'],
];

/** Invalidates every ledger-dependent query (documents, journals, balances, reports). */
export function invalidateLedgerQueries(queryClient: QueryClient): Promise<void> {
  return Promise.all(
    LEDGER_QUERY_KEYS.map((queryKey) => queryClient.invalidateQueries({ queryKey })),
  ).then(() => undefined);
}
