import { Decimal } from '@prisma/client/runtime/library';

/** Explicit directions override stored signs; untyped legacy rows retain their sign. */
export function signedMovementQuantity(
  quantity: Decimal | number,
  movementType: string | null | undefined,
): number {
  return signedMovementQuantityDecimal(quantity, movementType).toNumber();
}

/** Use this exact quantity for valuation; numeric stock consumers retain their existing contract. */
export function signedMovementQuantityDecimal(
  quantity: Decimal | number,
  movementType: string | null | undefined,
): Decimal {
  const value = typeof quantity === 'number' ? new Decimal(quantity) : quantity;
  if (movementType === 'IN') return value.abs();
  if (movementType === 'OUT') return value.abs().negated();
  return value;
}
