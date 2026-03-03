import { Decimal } from '@prisma/client/runtime/library';

/**
 * Safe Decimal utilities for financial calculations.
 *
 * Replaces the anti-pattern: parseFloat(someDecimal.toString())
 * which loses precision on large monetary values.
 */
export class DecimalUtils {
  static readonly ZERO = new Decimal(0);

  /** Parse a value into a Decimal. Accepts Decimal, string, or number. */
  static from(value: Decimal | string | number | null | undefined): Decimal {
    if (value === null || value === undefined) return DecimalUtils.ZERO;
    if (value instanceof Decimal) return value;
    return new Decimal(value);
  }

  /** Sum an array of Decimal-like values. */
  static sum(values: (Decimal | string | number)[]): Decimal {
    return values.reduce<Decimal>((acc, v) => acc.add(DecimalUtils.from(v)), DecimalUtils.ZERO);
  }

  static add(a: Decimal | string | number, b: Decimal | string | number): Decimal {
    return DecimalUtils.from(a).add(DecimalUtils.from(b));
  }

  static subtract(a: Decimal | string | number, b: Decimal | string | number): Decimal {
    return DecimalUtils.from(a).sub(DecimalUtils.from(b));
  }

  static multiply(a: Decimal | string | number, b: Decimal | string | number): Decimal {
    return DecimalUtils.from(a).mul(DecimalUtils.from(b));
  }

  static divide(a: Decimal | string | number, b: Decimal | string | number): Decimal {
    return DecimalUtils.from(a).div(DecimalUtils.from(b));
  }

  /** Safe conversion to number (only for display, NEVER for further math). */
  static toNumber(value: Decimal | string | number | null | undefined): number {
    return DecimalUtils.from(value).toNumber();
  }

  /** Format to fixed decimal string (e.g. "1234.5600"). */
  static toFixed(value: Decimal | string | number, decimals = 4): string {
    return DecimalUtils.from(value).toFixed(decimals);
  }

  /** Check if a Decimal is zero. */
  static isZero(value: Decimal | string | number): boolean {
    return DecimalUtils.from(value).isZero();
  }

  /** Check if two Decimal values are equal. */
  static equals(a: Decimal | string | number, b: Decimal | string | number): boolean {
    return DecimalUtils.from(a).equals(DecimalUtils.from(b));
  }

  /** Check if a > b. */
  static gt(a: Decimal | string | number, b: Decimal | string | number): boolean {
    return DecimalUtils.from(a).greaterThan(DecimalUtils.from(b));
  }

  /** Check if a < b. */
  static lt(a: Decimal | string | number, b: Decimal | string | number): boolean {
    return DecimalUtils.from(a).lessThan(DecimalUtils.from(b));
  }

  /** Check if a >= b. */
  static gte(a: Decimal | string | number, b: Decimal | string | number): boolean {
    return DecimalUtils.from(a).greaterThanOrEqualTo(DecimalUtils.from(b));
  }

  /** Check if a <= b. */
  static lte(a: Decimal | string | number, b: Decimal | string | number): boolean {
    return DecimalUtils.from(a).lessThanOrEqualTo(DecimalUtils.from(b));
  }

  /** Calculate a percentage: value * (percent / 100). */
  static percent(value: Decimal | string | number, percent: Decimal | string | number): Decimal {
    return DecimalUtils.from(value).mul(DecimalUtils.from(percent).div(100));
  }

  /** Absolute value. */
  static abs(value: Decimal | string | number): Decimal {
    return DecimalUtils.from(value).abs();
  }

  /** Returns the max of two Decimal values. */
  static max(a: Decimal | string | number, b: Decimal | string | number): Decimal {
    const da = DecimalUtils.from(a);
    const db = DecimalUtils.from(b);
    return da.greaterThan(db) ? da : db;
  }

  /** Returns the min of two Decimal values. */
  static min(a: Decimal | string | number, b: Decimal | string | number): Decimal {
    const da = DecimalUtils.from(a);
    const db = DecimalUtils.from(b);
    return da.lessThan(db) ? da : db;
  }
}
