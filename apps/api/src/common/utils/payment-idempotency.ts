import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

/**
 * Retry protection for "record payment" (customer receipts and supplier payments).
 *
 * The client sends one key per user action and the same key on every retry of it (double click,
 * network retry). The key is stored on the payment under a unique (organizationId,
 * idempotencyKey) index, so a retry finds the first payment and returns it instead of settling
 * the invoices or bills a second time.
 */

/** Printable ASCII, like the Idempotency-Key header of the integration API. */
export const PAYMENT_IDEMPOTENCY_KEY_PATTERN = /^[\x21-\x7e]{1,100}$/;

/**
 * What a payment does to the books: a retry must match all of it. A key reused after the form
 * changed (another invoice or bill, account, date or mode) is a different payment, not a retry.
 */
export interface PaymentRetryShape {
  partyId: string;
  amount: Decimal;
  date: Date;
  paymentMode: string;
  /** Deposit-to account for receipts, paid-from account for supplier payments. */
  accountId: string;
  /** Invoice or bill id with the amount allocated to it. */
  allocations: Array<{ documentId: string; amount: Decimal }>;
}

function sameAllocations(
  a: PaymentRetryShape['allocations'],
  b: PaymentRetryShape['allocations'],
): boolean {
  if (a.length !== b.length) return false;
  const byId = (x: { documentId: string }, y: { documentId: string }): number =>
    x.documentId < y.documentId ? -1 : x.documentId > y.documentId ? 1 : 0;
  const left = [...a].sort(byId);
  const right = [...b].sort(byId);
  return left.every(
    (row, i) => row.documentId === right[i].documentId && row.amount.equals(right[i].amount),
  );
}

/**
 * Returns true when `stored` is the payment this request already made; throws 409 when the key
 * was used for a different payment, so a reused key never hides one.
 */
export function assertSamePaymentRetry(
  stored: PaymentRetryShape,
  request: PaymentRetryShape,
): true {
  const same =
    stored.partyId === request.partyId &&
    stored.amount.equals(request.amount) &&
    stored.date.getTime() === request.date.getTime() &&
    stored.paymentMode === request.paymentMode &&
    stored.accountId === request.accountId &&
    sameAllocations(stored.allocations, request.allocations);
  if (!same) {
    throw new ConflictException('This payment was already recorded with different details');
  }
  return true;
}

/** True for the unique-index violation of a concurrent retry with the same key. */
export function isIdempotencyKeyConflict(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
    return false;
  }
  return JSON.stringify(error.meta?.target ?? '').includes('idempotencyKey');
}
