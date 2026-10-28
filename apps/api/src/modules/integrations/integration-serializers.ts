import { Prisma } from '@prisma/client';

/**
 * One shape per resource, shared by webhook payloads and the REST API, so a FlowLine flow can
 * read `data.invoice.balanceDue` the same way whether it came from an event or a GET. Money is a
 * fixed 4-dp decimal string, dates are `YYYY-MM-DD`, instants are ISO-8601 UTC.
 */
type Dec = Prisma.Decimal;

const money = (d: Dec | null | undefined): string => (d ? d.toFixed(4) : '0.0000');
const day = (d: Date | null | undefined): string | null =>
  d ? d.toISOString().slice(0, 10) : null;

/** Lines beyond this are dropped from payloads (`linesTruncated: true`) to stay far below 256 KB. */
export const MAX_PAYLOAD_LINES = 100;

export interface CustomerShape {
  id: string;
  name: string;
  displayName: string | null;
  email: string | null;
  phone: string | null;
  taxId: string | null;
  currency: string;
  paymentTermsDays: number;
  createdAt: string;
}

export function serializeCustomer(c: {
  id: string;
  name: string;
  displayName: string | null;
  email: string | null;
  phone: string | null;
  taxId: string | null;
  currency: string;
  paymentTerms: number;
  createdAt: Date;
}): CustomerShape {
  return {
    id: c.id,
    name: c.name,
    displayName: c.displayName,
    email: c.email,
    phone: c.phone,
    taxId: c.taxId,
    currency: c.currency,
    paymentTermsDays: c.paymentTerms,
    createdAt: c.createdAt.toISOString(),
  };
}

export const INVOICE_SHAPE_INCLUDE = {
  customer: { select: { id: true, name: true, email: true, phone: true } },
  lines: {
    orderBy: { sortOrder: 'asc' },
    take: MAX_PAYLOAD_LINES + 1,
    select: {
      description: true,
      quantity: true,
      rate: true,
      discount: true,
      taxRate: true,
      amount: true,
    },
  },
} satisfies Prisma.InvoiceInclude;

export type InvoiceForShape = Prisma.InvoiceGetPayload<{ include: typeof INVOICE_SHAPE_INCLUDE }>;

export interface InvoiceShape {
  id: string;
  number: string;
  status: string;
  currency: string;
  date: string | null;
  dueDate: string | null;
  issuedAt: string | null;
  subtotal: string;
  taxAmount: string;
  shippingAmount: string;
  total: string;
  amountPaid: string;
  balanceDue: string;
  daysOverdue: number;
  notes: string | null;
  customer: { id: string; name: string; email: string | null; phone: string | null };
  lines: {
    description: string;
    quantity: string;
    rate: string;
    discountPercent: string;
    taxRatePercent: string;
    amount: string;
  }[];
  linesTruncated: boolean;
  createdAt: string;
  updatedAt: string;
}

export function daysOverdue(
  dueDate: Date,
  balanceDue: Dec,
  status: string,
  now = new Date(),
): number {
  if (
    balanceDue.lessThanOrEqualTo(0) ||
    status === 'DRAFT' ||
    status === 'VOID' ||
    status === 'PAID'
  ) {
    return 0;
  }
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const due = Date.UTC(dueDate.getUTCFullYear(), dueDate.getUTCMonth(), dueDate.getUTCDate());
  return Math.max(0, Math.floor((today - due) / 86_400_000));
}

export function serializeInvoice(inv: InvoiceForShape, baseCurrency: string): InvoiceShape {
  const lines = inv.lines.slice(0, MAX_PAYLOAD_LINES);
  const paid = inv.grandTotal.sub(inv.balanceDue);
  return {
    id: inv.id,
    number: inv.invoiceNumber,
    status: inv.status,
    currency: (inv.currencyCode?.trim() || baseCurrency).toUpperCase(),
    date: day(inv.date),
    dueDate: day(inv.dueDate),
    issuedAt: inv.issueDate ? inv.issueDate.toISOString() : null,
    subtotal: money(inv.subtotal),
    taxAmount: money(inv.taxAmount),
    shippingAmount: money(inv.shippingAmount),
    total: money(inv.grandTotal),
    // A draft has not been issued, so nothing about it is "paid".
    amountPaid: inv.status === 'DRAFT' || paid.lessThan(0) ? '0.0000' : paid.toFixed(4),
    balanceDue: money(inv.balanceDue),
    daysOverdue: daysOverdue(inv.dueDate, inv.balanceDue, inv.status),
    notes: inv.notes,
    customer: {
      id: inv.customer.id,
      name: inv.customer.name,
      email: inv.customer.email,
      phone: inv.customer.phone,
    },
    lines: lines.map((l) => ({
      description: l.description,
      quantity: l.quantity.toFixed(4),
      rate: l.rate.toFixed(4),
      discountPercent: l.discount.toFixed(4),
      taxRatePercent: l.taxRate.toFixed(2),
      amount: l.amount.toFixed(4),
    })),
    linesTruncated: inv.lines.length > MAX_PAYLOAD_LINES,
    createdAt: inv.createdAt.toISOString(),
    updatedAt: inv.updatedAt.toISOString(),
  };
}

export const PAYMENT_SHAPE_INCLUDE = {
  customer: { select: { id: true, name: true, email: true, phone: true } },
  allocations: {
    take: MAX_PAYLOAD_LINES,
    select: { amount: true, invoice: { select: { id: true, invoiceNumber: true } } },
  },
} satisfies Prisma.PaymentReceivedInclude;

export type PaymentForShape = Prisma.PaymentReceivedGetPayload<{
  include: typeof PAYMENT_SHAPE_INCLUDE;
}>;

export interface PaymentShape {
  id: string;
  number: string;
  date: string | null;
  amount: string;
  currency: string;
  mode: string;
  reference: string | null;
  customer: { id: string; name: string; email: string | null; phone: string | null };
  allocations: { invoiceId: string; invoiceNumber: string; amount: string }[];
  createdAt: string;
}

export function serializePayment(p: PaymentForShape, baseCurrency: string): PaymentShape {
  return {
    id: p.id,
    number: p.paymentNumber,
    date: day(p.date),
    amount: money(p.amount),
    currency: baseCurrency.toUpperCase(),
    mode: p.paymentMode,
    reference: p.reference,
    customer: {
      id: p.customer.id,
      name: p.customer.name,
      email: p.customer.email,
      phone: p.customer.phone,
    },
    allocations: p.allocations.map((a) => ({
      invoiceId: a.invoice.id,
      invoiceNumber: a.invoice.invoiceNumber,
      amount: money(a.amount),
    })),
    createdAt: p.createdAt.toISOString(),
  };
}
