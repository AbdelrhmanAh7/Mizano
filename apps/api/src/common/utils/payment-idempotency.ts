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

/** The parts of a stored payment a retry must match. */
interface StoredPayment {
  amount: Decimal;
  partyId: string;
}

/**
 * Returns true when `stored` is the payment this request already made; throws 409 when the key
 * was used for a different payment (another party or amount), so a reused key never hides one.
 */
export function assertSamePaymentRetry(
  stored: StoredPayment,
  request: { amount: Decimal; partyId: string },
): true {
  if (stored.partyId !== request.partyId || !stored.amount.equals(request.amount)) {
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
