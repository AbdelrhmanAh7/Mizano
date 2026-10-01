/**
 * Pure helpers for issuing a vendor credit (POST /vendor-credits). The payload is exactly the
 * API DTO: `amount` is a decimal string (gross of VAT); the server splits the VAT from the bill.
 */

import { compareDecimals, isPositiveDecimal } from '@/lib/decimal';
import { MONEY_PATTERN } from './expense-payload';

export interface VendorCreditFormValues {
  vendorId: string;
  billId: string;
  date: string;
  amount: string;
  reason?: string;
  accountId?: string;
}

export interface CreateVendorCreditPayload {
  vendorId: string;
  billId: string;
  date: string;
  amount: string;
  reason?: string;
  accountId?: string;
}

export function buildVendorCreditPayload(
  values: VendorCreditFormValues,
): CreateVendorCreditPayload {
  const optional = (v?: string): string | undefined =>
    v && v.trim() !== '' ? v.trim() : undefined;
  return {
    vendorId: values.vendorId,
    billId: values.billId,
    date: values.date,
    amount: values.amount.trim(),
    reason: optional(values.reason),
    accountId: optional(values.accountId),
  };
}

export type CreditAmountIssue = 'INVALID' | 'EXCEEDS_BILL' | null;

/** Mirrors the API check that a credit cannot exceed the bill total (the API also counts earlier credits). */
export function checkCreditAmount(
  amount: string,
  billTotal: string | undefined,
): CreditAmountIssue {
  const value = amount.trim();
  if (!MONEY_PATTERN.test(value) || !isPositiveDecimal(value)) return 'INVALID';
  if (billTotal !== undefined && compareDecimals(value, billTotal) > 0) return 'EXCEEDS_BILL';
  return null;
}
