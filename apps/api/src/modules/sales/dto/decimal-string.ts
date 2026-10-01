import { applyDecorators } from '@nestjs/common';
import { Matches } from 'class-validator';

/** Decimal(19, 4): 15 integer digits and 4 fraction digits at most. */
export const MAX_INTEGER_DIGITS = 15;
export const MAX_FRACTION_DIGITS = 4;

/**
 * A non-negative decimal transported as a string ("100", "12.50"): money, quantities and
 * percentages never travel as JS numbers. Precision is bounded to the Decimal(19, 4) columns
 * (at most 15 integer digits; `maxDecimals`, itself capped at 4, fraction digits) so nothing is
 * silently rounded or overflows the database.
 */
export function IsDecimalString(maxDecimals = MAX_FRACTION_DIGITS): PropertyDecorator {
  const decimals = Math.min(maxDecimals, MAX_FRACTION_DIGITS);
  return applyDecorators(
    Matches(new RegExp(`^\\d{1,${MAX_INTEGER_DIGITS}}(\\.\\d{1,${decimals}})?$`), {
      message: ({ property }) =>
        `${property} must be a non-negative decimal string with at most ${MAX_INTEGER_DIGITS} integer digits and ${decimals} decimal places`,
    }),
  );
}
