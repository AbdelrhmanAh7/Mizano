/**
 * Pure helpers for recording a vendor payment (POST /payments-made). They mirror the API's
 * rules so the form can block invalid submissions before the round trip:
 *  - amount and every allocation are decimal strings > 0 (no floats on the wire),
 *  - each bill is allocated at most once and never more than its balance due,
 *  - allocations sum exactly to the payment amount (exact decimal comparison).
 * The API re-validates everything inside its transaction and remains the source of truth.
 */

import {
  compareDecimals,
  formatScaled,
  isPositiveDecimal,
  normalizeDecimal,
  parseDecimal,
  subtractDecimals,
  sumDecimals,
  toScaled,
} from '@/lib/decimal';

export const PAYMENT_MODES = [
  'BANK_TRANSFER',
  'CASH',
  'CHEQUE',
  'CREDIT_CARD',
  'DEBIT_CARD',
  'ONLINE',
  'OTHER',
] as const;

export type PaymentMode = (typeof PAYMENT_MODES)[number];

/** Bill statuses the API accepts payments against. */
export const PAYABLE_BILL_STATUSES = ['OPEN', 'PARTIALLY_PAID', 'OVERDUE'] as const;

export interface PayableBill {
  id: string;
  billNumber: string;
  date: string;
  dueDate: string;
  grandTotal: string;
  balanceDue: string;
  status?: string;
}

/** billId -> allocated amount as typed by the user ("" means not allocated). */
export type AllocationMap = Record<string, string>;

export type AllocationIssue =
  | { code: 'AMOUNT_INVALID' }
  | { code: 'NO_ALLOCATIONS' }
  | { code: 'ALLOCATION_INVALID'; billId: string }
  | { code: 'ALLOCATION_EXCEEDS_BALANCE'; billId: string }
  | { code: 'SUM_MISMATCH'; allocated: string; amount: string; difference: string };

export interface AllocationSummary {
  /** Exact sum of valid allocations. */
  allocated: string;
  /** amount - allocated (negative when over-allocated). */
  unallocated: string;
  issues: AllocationIssue[];
  isValid: boolean;
}

/** Money typed by the user: digits with up to 2 decimals (what MoneyInput allows). */
export function isMoneyInput(value: string | null | undefined): boolean {
  return typeof value === 'string' && /^\d+(\.\d{1,2})?$/.test(value.trim());
}

/** Remaining balance of a bill after a proposed allocation (never below zero for display). */
export function remainingBalance(balanceDue: string, allocated: string | undefined): string {
  const remaining = subtractDecimals(balanceDue, allocated || '0');
  return compareDecimals(remaining, '0') < 0 ? '0.00' : remaining;
}

/** Validates the allocation table against the payment amount exactly like the API does. */
export function summarizeAllocations(
  amount: string,
  allocations: AllocationMap,
  bills: PayableBill[],
): AllocationSummary {
  const issues: AllocationIssue[] = [];
  const amountValid = isMoneyInput(amount) && isPositiveDecimal(amount);
  if (!amountValid) issues.push({ code: 'AMOUNT_INVALID' });

  const entered = Object.entries(allocations).filter(([, value]) => (value ?? '').trim() !== '');
  const validAmounts: string[] = [];
  let positiveCount = 0;
  for (const [billId, value] of entered) {
    const bill = bills.find((b) => b.id === billId);
    if (!bill || !isMoneyInput(value)) {
      issues.push({ code: 'ALLOCATION_INVALID', billId });
      continue;
    }
    if (!isPositiveDecimal(value)) continue; // an explicit 0 simply means "not allocated"
    positiveCount += 1;
    validAmounts.push(value);
    if (compareDecimals(value, bill.balanceDue) > 0) {
      issues.push({ code: 'ALLOCATION_EXCEEDS_BALANCE', billId });
    }
  }
  if (positiveCount === 0) issues.push({ code: 'NO_ALLOCATIONS' });

  const allocated = sumDecimals(validAmounts);
  const unallocated = subtractDecimals(amountValid ? amount : '0', allocated);
  if (amountValid && positiveCount > 0 && compareDecimals(allocated, amount) !== 0) {
    issues.push({
      code: 'SUM_MISMATCH',
      allocated,
      amount: normalizeDecimal(amount),
      difference: unallocated,
    });
  }

  return { allocated, unallocated, issues, isValid: issues.length === 0 };
}

function byDueDateThenNumber(a: PayableBill, b: PayableBill): number {
  const due = new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
  if (due !== 0 && !Number.isNaN(due)) return due;
  return a.billNumber.localeCompare(b.billNumber);
}

/** Spreads the payment over the oldest-due bills first, never exceeding a bill's balance. */
export function autoAllocate(amount: string, bills: PayableBill[]): AllocationMap {
  let remaining = parseDecimal(amount);
  const result: AllocationMap = {};
  if (remaining === null || remaining <= BigInt(0)) return result;
  for (const bill of [...bills].sort(byDueDateThenNumber)) {
    if (remaining <= BigInt(0)) break;
    const balance = toScaled(bill.balanceDue);
    if (balance <= BigInt(0)) continue;
    const take = balance < remaining ? balance : remaining;
    result[bill.id] = formatScaled(take);
    remaining -= take;
  }
  return result;
}

export interface PaymentFormValues {
  vendorId: string;
  /** yyyy-MM-dd */
  date: string;
  amount: string;
  paymentMode: PaymentMode;
  paidFromAccountId: string;
  reference?: string;
  notes?: string;
}

export interface CreatePaymentMadePayload {
  vendorId: string;
  date: string;
  amount: string;
  paymentMode: PaymentMode;
  paidFromAccountId: string;
  reference?: string;
  notes?: string;
  allocations: Array<{ billId: string; amount: string }>;
}

/** Builds the POST /payments-made body: decimal strings only, zero allocations dropped. */
export function buildPaymentMadePayload(
  values: PaymentFormValues,
  allocations: AllocationMap,
): CreatePaymentMadePayload {
  const reference = values.reference?.trim();
  const notes = values.notes?.trim();
  return {
    vendorId: values.vendorId,
    date: values.date,
    amount: normalizeDecimal(values.amount),
    paymentMode: values.paymentMode,
    paidFromAccountId: values.paidFromAccountId,
    ...(reference ? { reference } : {}),
    ...(notes ? { notes } : {}),
    allocations: Object.entries(allocations)
      .filter(([, value]) => isPositiveDecimal(value))
      .map(([billId, value]) => ({ billId, amount: normalizeDecimal(value) })),
  };
}

export interface LedgerAccountOption {
  id: string;
  code: string;
  name: string;
  type: string;
  isActive?: boolean;
}

export interface PaidFromHints {
  defaultBankAccountId?: string | null;
  defaultCashAccountId?: string | null;
  /** Ledger accounts linked to banking-module bank accounts. */
  linkedAccountIds?: string[];
}

const CASH_OR_BANK_NAME = /\b(cash|bank|petty)\b|نقد|بنك|صندوق|خزينة|مصرف/i;

/**
 * Ledger accounts a vendor payment may be paid from: active ASSET accounts that are the
 * organization's default bank/cash accounts, linked to a bank account, coded 10xx/11xx or
 * named like cash/bank. Falls back to all active ASSET accounts when none match.
 * Defaults come first so the form can preselect them.
 */
export function selectPaidFromAccounts<T extends LedgerAccountOption>(
  accounts: T[],
  hints: PaidFromHints = {},
): T[] {
  const assets = accounts.filter((a) => a.type === 'ASSET' && a.isActive !== false);
  const preferred = new Set(
    [
      hints.defaultBankAccountId,
      hints.defaultCashAccountId,
      ...(hints.linkedAccountIds ?? []),
    ].filter((id): id is string => !!id),
  );
  const matches = assets.filter(
    (a) =>
      preferred.has(a.id) ||
      a.code.startsWith('10') ||
      a.code.startsWith('11') ||
      CASH_OR_BANK_NAME.test(a.name),
  );
  const list = matches.length > 0 ? matches : assets;
  const rank = (a: T): number =>
    a.id === hints.defaultBankAccountId ? 0 : a.id === hints.defaultCashAccountId ? 1 : 2;
  return [...list].sort((a, b) => rank(a) - rank(b) || a.code.localeCompare(b.code));
}

/** Preselected paid-from account: default bank, then default cash, when they are selectable. */
export function defaultPaidFromAccountId(
  options: LedgerAccountOption[],
  hints: PaidFromHints = {},
): string {
  for (const id of [hints.defaultBankAccountId, hints.defaultCashAccountId]) {
    if (id && options.some((o) => o.id === id)) return id;
  }
  return '';
}
