import { Decimal } from '@prisma/client/runtime/library';

/**
 * Custom Jest matchers for Decimal comparison.
 * Money values must never be compared with floating-point arithmetic.
 */

/**
 * Assert two Decimal values are equal
 */
export function expectDecimalEqual(actual: Decimal, expected: Decimal | string | number): void {
  const actualDec = actual instanceof Decimal ? actual : new Decimal(actual);
  const expectedDec = expected instanceof Decimal ? expected : new Decimal(expected);
  expect(actualDec.equals(expectedDec)).toBe(true);
}

/**
 * Assert a Decimal is greater than another
 */
export function expectDecimalGreaterThan(actual: Decimal, expected: Decimal | string | number): void {
  const actualDec = actual instanceof Decimal ? actual : new Decimal(actual);
  const expectedDec = expected instanceof Decimal ? expected : new Decimal(expected);
  expect(actualDec.greaterThan(expectedDec)).toBe(true);
}

/**
 * Assert a Decimal is zero
 */
export function expectDecimalZero(actual: Decimal): void {
  expect(actual.equals(new Decimal(0))).toBe(true);
}

/**
 * Create a Decimal from a string (convenience for tests)
 */
export function dec(value: string | number): Decimal {
  return new Decimal(value);
}
