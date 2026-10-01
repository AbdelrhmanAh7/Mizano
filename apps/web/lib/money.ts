/**
 * Exact client-side money preview. Mirrors the API's shared document-totals calculator
 * (apps/api/src/common/utils/document-totals.ts): tax is a percentage, line net and line tax
 * are rounded half-up to 2 decimals per line. The API remains the source of truth; this only
 * keeps the on-screen preview identical to what will be posted.
 *
 * Values are decimal strings and arithmetic uses scaled BigInt, never floating point.
 */

const SCALE = 4; // internal fixed-point scale for inputs
const DECIMAL_RE = /^\s*(\d+)(?:\.(\d+))?\s*$/;
const ZERO = BigInt(0);
const ONE = BigInt(1);
const TWO = BigInt(2);
const TEN = BigInt(10);
const HUNDRED = BigInt(100);

function pow10(n: number): bigint {
  let r = ONE;
  for (let i = 0; i < n; i++) r *= TEN;
  return r;
}

/** Parses a non-negative decimal string to an integer scaled by 10^SCALE. Invalid -> 0. */
function toScaled(value: string | number | null | undefined): bigint {
  const match = DECIMAL_RE.exec(value === null || value === undefined ? '' : String(value));
  if (!match) return ZERO;
  const frac = (match[2] ?? '').slice(0, SCALE).padEnd(SCALE, '0');
  return BigInt(match[1]) * pow10(SCALE) + BigInt(frac);
}

/** Divides with half-up rounding (non-negative operands). */
function divRound(numerator: bigint, denominator: bigint): bigint {
  return (numerator * TWO + denominator) / (denominator * TWO);
}

/** Cents (scale 2) to a "1234.56" string. */
function centsToString(cents: bigint): string {
  const whole = cents / HUNDRED;
  const frac = (cents % HUNDRED).toString().padStart(2, '0');
  return `${whole}.${frac}`;
}

export interface MoneyLineInput {
  quantity?: string | number | null;
  rate?: string | number | null;
  taxRate?: string | number | null; // percent
}

export interface MoneyTotals {
  lines: { net: string; tax: string; total: string }[];
  subtotal: string;
  taxAmount: string;
  grandTotal: string;
}

export function computeTotals(lines: MoneyLineInput[]): MoneyTotals {
  // qty and rate are scale-4 each: product is scale 8; cents are scale 2.
  const toCentsFromScale8 = pow10(8 - 2);
  let subtotal = ZERO;
  let tax = ZERO;
  const out = lines.map((line) => {
    const netCents = divRound(toScaled(line.quantity) * toScaled(line.rate), toCentsFromScale8);
    // percent is scale 4; net × pct / 100 -> divide by 100 × 10^4
    const taxCents = divRound(netCents * toScaled(line.taxRate), HUNDRED * pow10(SCALE));
    subtotal += netCents;
    tax += taxCents;
    return {
      net: centsToString(netCents),
      tax: centsToString(taxCents),
      total: centsToString(netCents + taxCents),
    };
  });
  return {
    lines: out,
    subtotal: centsToString(subtotal),
    taxAmount: centsToString(tax),
    grandTotal: centsToString(subtotal + tax),
  };
}

/** Normalizes user input to a decimal string for API transport ("" -> fallback). */
export function toDecimalInput(value: string | number | null | undefined, fallback = '0'): string {
  const text = value === null || value === undefined ? '' : String(value).trim();
  return DECIMAL_RE.test(text) ? text : fallback;
}
