/**
 * Pure helpers for recording an expense (POST /expenses). The payload is exactly the API DTO:
 * `amount` and `taxRate` travel as decimal strings and the VAT amount is never sent (the server
 * computes it from the percentage). The preview mirrors the server's rounding (half up to 2
 * decimals) with exact BigInt arithmetic so the total shown is what will be posted.
 */

import { formatScaled, isPositiveDecimal, parseDecimal } from '@/lib/decimal';

export interface ExpenseFormValues {
  date: string;
  accountId: string;
  vendorId?: string;
  amount: string;
  taxRate?: string;
  taxInclusive: boolean;
  paidThroughAccountId: string;
  description?: string;
  reference?: string;
  projectId?: string;
}

export interface CreateExpensePayload {
  date: string;
  accountId: string;
  vendorId?: string;
  amount: string;
  taxRate?: string;
  taxInclusive: boolean;
  paidThroughAccountId: string;
  description?: string;
  reference?: string;
  projectId?: string;
}

/** Up to 15 integer digits and 4 decimals: what Decimal(19, 4) can store. */
export const MONEY_PATTERN = /^\d{1,15}(\.\d{1,4})?$/;
/** A percentage with up to 2 decimals. */
export const PERCENT_PATTERN = /^\d{1,3}(\.\d{1,2})?$/;

export function buildExpensePayload(values: ExpenseFormValues): CreateExpensePayload {
  const optional = (v?: string): string | undefined =>
    v && v.trim() !== '' ? v.trim() : undefined;
  const taxRate = optional(values.taxRate);
  return {
    date: values.date,
    accountId: values.accountId,
    vendorId: optional(values.vendorId),
    amount: values.amount.trim(),
    taxRate: taxRate && isPositiveDecimal(taxRate) ? taxRate : undefined,
    taxInclusive: values.taxInclusive,
    paidThroughAccountId: values.paidThroughAccountId,
    description: optional(values.description),
    reference: optional(values.reference),
    projectId: optional(values.projectId),
  };
}

const ZERO = BigInt(0);

/** Half-up integer division for non-negative operands. */
function divRound(numerator: bigint, denominator: bigint): bigint {
  return (numerator * BigInt(2) + denominator) / (denominator * BigInt(2));
}

export interface ExpensePreview {
  net: string;
  tax: string;
  total: string;
}

/** Net / VAT / total exactly as the server will post them; null while the input is not valid. */
export function previewExpense(
  amount: string,
  taxRate: string | undefined,
  taxInclusive: boolean,
): ExpensePreview | null {
  const a = parseDecimal(amount);
  const r = parseDecimal(taxRate && taxRate.trim() !== '' ? taxRate : '0');
  if (a === null || r === null || a <= ZERO || r < ZERO) return null;

  // VAT in cents: exclusive a*r/100 ; inclusive a*r/(100+r), a and r scaled by 10^4.
  const taxCents = taxInclusive
    ? divRound(a * r * BigInt(100), BigInt(10000) * (BigInt(1000000) + r))
    : divRound(a * r, BigInt(100000000));
  const tax = taxCents * BigInt(100);
  const net = taxInclusive ? a - tax : a;
  return {
    net: formatScaled(net),
    tax: formatScaled(tax),
    total: formatScaled(net + tax),
  };
}
