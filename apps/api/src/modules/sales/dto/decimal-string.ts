import { applyDecorators } from '@nestjs/common';
import { Matches } from 'class-validator';

/**
 * A non-negative decimal transported as a string ("100", "12.50"): money, quantities and
 * percentages never travel as JS numbers. `maxDecimals` mirrors the column scale so nothing is
 * silently rounded by the database.
 */
export function IsDecimalString(maxDecimals = 4): PropertyDecorator {
  return applyDecorators(
    Matches(new RegExp(`^\\d+(\\.\\d{1,${maxDecimals}})?$`), {
      message: ({ property }) =>
        `${property} must be a non-negative decimal string with at most ${maxDecimals} decimal places`,
    }),
  );
}
