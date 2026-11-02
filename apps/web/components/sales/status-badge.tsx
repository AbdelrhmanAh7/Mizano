'use client';

import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

// Invoice status types and colors
export type InvoiceStatus = 'DRAFT' | 'SENT' | 'PARTIALLY_PAID' | 'PAID' | 'OVERDUE' | 'VOID';

export const invoiceStatusColors: Record<InvoiceStatus, string> = {
  DRAFT: 'bg-muted text-foreground border-border',
  SENT: 'bg-info/10 text-info border-info/30',
  PARTIALLY_PAID: 'bg-warning/10 text-warning border-warning/30',
  PAID: 'bg-success/10 text-success border-success/30',
  OVERDUE: 'bg-destructive/10 text-destructive border-destructive/30',
  VOID: 'bg-muted text-muted-foreground border-border',
};

// Quote status types and colors
export type QuoteStatus = 'DRAFT' | 'SENT' | 'ACCEPTED' | 'INVOICED' | 'DECLINED' | 'EXPIRED';

export const quoteStatusColors: Record<QuoteStatus, string> = {
  DRAFT: 'bg-muted text-foreground border-border',
  SENT: 'bg-info/10 text-info border-info/30',
  ACCEPTED: 'bg-success/10 text-success border-success/30',
  INVOICED: 'bg-primary/10 text-primary border-primary/30',
  DECLINED: 'bg-destructive/10 text-destructive border-destructive/30',
  EXPIRED: 'bg-warning/10 text-warning border-warning/30',
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
  CASH: 'bg-success/10 text-success border-success/30',
  BANK_TRANSFER: 'bg-info/10 text-info border-info/30',
  CREDIT_CARD: 'bg-primary/10 text-primary border-primary/30',
  DEBIT_CARD: 'bg-info/10 text-info border-info/30',
  CHEQUE: 'bg-warning/10 text-warning border-warning/30',
  ONLINE: 'bg-info/10 text-info border-info/30',
  OTHER: 'bg-muted text-foreground border-border',
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

/** Plain translated invoice status, for places that keep their own badge style. */
export function InvoiceStatusText({ status }: { status: string }) {
  return <>{useEnumLabel('sales.invoices.status', invoiceStatusKeys, status)}</>;
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

/** Translated label of a payment mode (common.paymentModes), for badges and detail cards. */
export function usePaymentModeLabel(mode: PaymentMode | undefined): string {
  return useEnumLabel('common.paymentModes', paymentModeKeys, mode ?? '');
}

/** Plain translated payment mode, for table cells (customer and vendor payments alike). */
export function PaymentModeText({ mode }: { mode: PaymentMode }) {
  return <>{usePaymentModeLabel(mode)}</>;
}

export function PaymentModeBadge({ mode, className }: PaymentModeBadgeProps) {
  const label = usePaymentModeLabel(mode);
  return (
    <StatusBadge
      status={mode}
      colorMap={paymentModeColors}
      labelMap={{ [mode]: label }}
      className={className}
    />
  );
}
