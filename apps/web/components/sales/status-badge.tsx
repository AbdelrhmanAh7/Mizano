'use client';

import { useTranslations } from 'next-intl';
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

// Translation keys of each value; the badges show the user's language.
const invoiceStatusKeys: Record<InvoiceStatus, string> = {
  DRAFT: 'draft',
  SENT: 'sent',
  PARTIALLY_PAID: 'partiallyPaid',
  PAID: 'paid',
  OVERDUE: 'overdue',
  VOID: 'void',
};

const quoteStatusKeys: Record<QuoteStatus, string> = {
  DRAFT: 'draft',
  SENT: 'sent',
  ACCEPTED: 'accepted',
  INVOICED: 'invoiced',
  DECLINED: 'declined',
  EXPIRED: 'expired',
};

const paymentModeKeys: Record<PaymentMode, string> = {
  CASH: 'cash',
  BANK_TRANSFER: 'bankTransfer',
  CREDIT_CARD: 'creditCard',
  DEBIT_CARD: 'debitCard',
  CHEQUE: 'cheque',
  ONLINE: 'online',
  OTHER: 'other',
};

/** Label of `value` in `namespace`, or the value itself when it is not a known one. */
function useEnumLabel(namespace: string, keys: Record<string, string>, value: string): string {
  const t = useTranslations(namespace);
  const key = keys[value];
  return key ? t(key) : value;
}

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
  const color = colorMap[status] || 'bg-muted text-muted-foreground border-border';
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
  const label = useEnumLabel('sales.invoices.status', invoiceStatusKeys, status);
  return (
    <StatusBadge
      status={status}
      colorMap={invoiceStatusColors}
      labelMap={{ [status]: label }}
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
  const label = useEnumLabel('sales.quotes.status', quoteStatusKeys, status);
  return (
    <StatusBadge
      status={status}
      colorMap={quoteStatusColors}
      labelMap={{ [status]: label }}
      className={className}
    />
  );
}

interface PaymentModeBadgeProps {
  mode: PaymentMode;
  className?: string;
}

export function PaymentModeBadge({ mode, className }: PaymentModeBadgeProps) {
  const label = useEnumLabel('common.paymentModes', paymentModeKeys, mode);
  return (
    <StatusBadge
      status={mode}
      colorMap={paymentModeColors}
      labelMap={{ [mode]: label }}
      className={className}
    />
  );
}
