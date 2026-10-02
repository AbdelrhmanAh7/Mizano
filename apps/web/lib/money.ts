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
  discountPercent?: string | number | null; // percent, applied to the line before tax
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
    // net = qty x rate x (100 - discount) / 100, rounded once to cents (as the API does).
    const rawFactor = HUNDRED * pow10(SCALE) - toScaled(line.discountPercent);
    const factor = rawFactor < ZERO ? ZERO : rawFactor;
    const netCents = divRound(
      toScaled(line.quantity) * toScaled(line.rate) * factor,
      toCentsFromScale8 * HUNDRED * pow10(SCALE),
    );
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

/**
 * Converts an API money value (a fixed-scale decimal string, or a legacy number) to a number for
 * DISPLAY and chart plotting only. The API computes every sum in exact Decimal; never add or
 * compare money with the result, and never send it back to the API.
 */
export function moneyToNumber(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

export type TotalsField = 'subtotal' | 'tax' | 'total';

export interface TotalsDiscrepancy {
  field: TotalsField;
  /** Value read from the document, as a plain decimal string. */
  extracted: string;
  /** Value computed from the reviewed lines with `computeTotals`. */
  computed: string;
}

export interface ExtractedTotalsInput {
  subtotal?: string | number | null;
  tax?: string | number | null;
  total?: string | number | null;
}

/** Largest accepted gap between an extracted and a computed total (0.01), in scale-4 units. */
const DISCREPANCY_TOLERANCE = BigInt(100);

/**
 * Compares document-level totals read by extraction with the totals computed from the reviewed
 * lines. The computed values always win; any field that differs by more than 0.01 is returned so
 * the review UI can warn. A missing extracted value is not a discrepancy.
 */
export function findTotalsDiscrepancies(
  computed: Pick<MoneyTotals, 'subtotal' | 'taxAmount' | 'grandTotal'>,
  extracted: ExtractedTotalsInput,
): TotalsDiscrepancy[] {
  const pairs: Array<[TotalsField, string | number | null | undefined, string]> = [
    ['subtotal', extracted.subtotal, computed.subtotal],
    ['tax', extracted.tax, computed.taxAmount],
    ['total', extracted.total, computed.grandTotal],
  ];
  const out: TotalsDiscrepancy[] = [];
  for (const [field, raw, computedText] of pairs) {
    if (raw === null || raw === undefined || !DECIMAL_RE.test(String(raw))) continue;
    const diff = toScaled(raw) - toScaled(computedText);
    if ((diff < ZERO ? -diff : diff) > DISCREPANCY_TOLERANCE) {
      out.push({ field, extracted: String(raw).trim(), computed: computedText });
    }
  }
  return out;
}
