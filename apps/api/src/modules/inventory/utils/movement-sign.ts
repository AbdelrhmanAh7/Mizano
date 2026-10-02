import { Decimal } from '@prisma/client/runtime/library';

/** Explicit directions override stored signs; untyped legacy rows retain their sign. */
export function signedMovementQuantity(
  quantity: Decimal | number,
  movementType: string | null | undefined,
): number {
  const value = typeof quantity === 'number' ? quantity : quantity.toNumber();
  if (movementType === 'IN') return Math.abs(value);
  if (movementType === 'OUT') return -Math.abs(value);
  return value;
}
