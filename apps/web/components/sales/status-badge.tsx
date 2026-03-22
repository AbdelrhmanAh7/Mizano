'use client';

import { cn } from '@/lib/utils';

// Invoice status types and colors
export type InvoiceStatus = 'DRAFT' | 'SENT' | 'PARTIALLY_PAID' | 'PAID' | 'OVERDUE' | 'VOID';

export const invoiceStatusColors: Record<InvoiceStatus, string> = {
  DRAFT: 'bg-gray-100 text-gray-800 border-gray-200',
  SENT: 'bg-blue-100 text-blue-800 border-blue-200',
  PARTIALLY_PAID: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  PAID: 'bg-green-100 text-green-800 border-green-200',
  OVERDUE: 'bg-red-100 text-red-800 border-red-200',
  VOID: 'bg-gray-100 text-gray-500 border-gray-200',
};

export const invoiceStatusLabels: Record<InvoiceStatus, string> = {
  DRAFT: 'Draft',
  SENT: 'Sent',
  PARTIALLY_PAID: 'Partially Paid',
  PAID: 'Paid',
  OVERDUE: 'Overdue',
  VOID: 'Void',
};

// Quote status types and colors
export type QuoteStatus = 'DRAFT' | 'SENT' | 'ACCEPTED' | 'INVOICED' | 'DECLINED' | 'EXPIRED';

export const quoteStatusColors: Record<QuoteStatus, string> = {
  DRAFT: 'bg-gray-100 text-gray-800 border-gray-200',
  SENT: 'bg-blue-100 text-blue-800 border-blue-200',
  ACCEPTED: 'bg-green-100 text-green-800 border-green-200',
  INVOICED: 'bg-purple-100 text-purple-800 border-purple-200',
  DECLINED: 'bg-red-100 text-red-800 border-red-200',
  EXPIRED: 'bg-orange-100 text-orange-800 border-orange-200',
};

export const quoteStatusLabels: Record<QuoteStatus, string> = {
  DRAFT: 'Draft',
  SENT: 'Sent',
  ACCEPTED: 'Accepted',
  INVOICED: 'Invoiced',
  DECLINED: 'Declined',
  EXPIRED: 'Expired',
};

// Credit note types
export type CreditNoteType = 'REFUND' | 'APPLY_TO_INVOICE';

export const creditNoteTypeColors: Record<CreditNoteType, string> = {
  REFUND: 'bg-green-100 text-green-800 border-green-200',
  APPLY_TO_INVOICE: 'bg-blue-100 text-blue-800 border-blue-200',
};

export const creditNoteTypeLabels: Record<CreditNoteType, string> = {
  REFUND: 'Refund',
  APPLY_TO_INVOICE: 'Applied to Invoice',
};

// Payment mode types
export type PaymentMode =
  | 'CASH'
  | 'BANK_TRANSFER'
  | 'CREDIT_CARD'
  | 'DEBIT_CARD'
  | 'CHEQUE'
  | 'ONLINE'
  | 'OTHER';

export const paymentModeColors: Record<PaymentMode, string> = {
  CASH: 'bg-green-100 text-green-800 border-green-200',
  BANK_TRANSFER: 'bg-blue-100 text-blue-800 border-blue-200',
  CREDIT_CARD: 'bg-purple-100 text-purple-800 border-purple-200',
  DEBIT_CARD: 'bg-indigo-100 text-indigo-800 border-indigo-200',
  CHEQUE: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  ONLINE: 'bg-cyan-100 text-cyan-800 border-cyan-200',
  OTHER: 'bg-gray-100 text-gray-800 border-gray-200',
};

export const paymentModeLabels: Record<PaymentMode, string> = {
  CASH: 'Cash',
  BANK_TRANSFER: 'Bank Transfer',
  CREDIT_CARD: 'Credit Card',
  DEBIT_CARD: 'Debit Card',
  CHEQUE: 'Cheque',
  ONLINE: 'Online',
  OTHER: 'Other',
};

// Generic status badge component
interface StatusBadgeProps {
  status: string;
  colorMap: Record<string, string>;
  labelMap: Record<string, string>;
  className?: string;
  strikethrough?: boolean;
}

export function StatusBadge({
  status,
  colorMap,
  labelMap,
  className,
  strikethrough = false,
}: StatusBadgeProps) {
  const color = colorMap[status] || 'bg-gray-100 text-gray-800 border-gray-200';
  const label = labelMap[status] || status;

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium',
        color,
        strikethrough && 'line-through',
        className,
      )}
    >
      {label}
    </span>
  );
}

// Pre-configured status badge components for convenience
interface InvoiceStatusBadgeProps {
  status: InvoiceStatus;
  className?: string;
}

export function InvoiceStatusBadge({ status, className }: InvoiceStatusBadgeProps) {
  return (
    <StatusBadge
      status={status}
      colorMap={invoiceStatusColors}
      labelMap={invoiceStatusLabels}
      strikethrough={status === 'VOID'}
      className={className}
    />
  );
}

interface QuoteStatusBadgeProps {
  status: QuoteStatus;
  className?: string;
}

export function QuoteStatusBadge({ status, className }: QuoteStatusBadgeProps) {
  return (
    <StatusBadge
      status={status}
      colorMap={quoteStatusColors}
      labelMap={quoteStatusLabels}
      className={className}
    />
  );
}

interface CreditNoteTypeBadgeProps {
  type: CreditNoteType;
  className?: string;
}

export function CreditNoteTypeBadge({ type, className }: CreditNoteTypeBadgeProps) {
  return (
    <StatusBadge
      status={type}
      colorMap={creditNoteTypeColors}
      labelMap={creditNoteTypeLabels}
      className={className}
    />
  );
}

interface PaymentModeBadgeProps {
  mode: PaymentMode;
  className?: string;
}

export function PaymentModeBadge({ mode, className }: PaymentModeBadgeProps) {
  return (
    <StatusBadge
      status={mode}
      colorMap={paymentModeColors}
      labelMap={paymentModeLabels}
      className={className}
    />
  );
}
