/**
 * Tax-rate resolution for scanned documents.
 *
 * Extraction gives tax AMOUNTS; the bill/invoice line stores a tax PERCENTAGE.
 * A percentage is only derived when it is exact (amount / net × 100 has at most
 * two decimal places); otherwise the line stays unresolved for the accountant.
 * A missing or zero extracted amount is also unresolved — extraction cannot
 * tell "no tax" from "not found", so it is never silently turned into 0%.
 *
 * Arithmetic uses scaled BigInt integers, never floating point.
 */

export interface ScanLineTaxInput {
  quantity: number | string | null | undefined;
  unitPrice: number | string | null | undefined;
  taxAmount: number | string | null | undefined;
}

export interface ScanHeaderTaxInput {
  subtotal: number | string | null | undefined;
  tax: number | string | null | undefined;
}

export type ScanTaxSource = 'line' | 'document';

export interface ResolvedScanLineTax {
  /** Percentage as a decimal string ("14"), or '' when unresolved. */
  taxRatePercent: string;
  unresolved: boolean;
  /** Where a resolved percentage came from. */
  source: ScanTaxSource | null;
  /** Extracted tax amount for this line as a decimal string, if any. */
  extractedTaxAmount: string | null;
}

interface ScaledDecimal {
  value: bigint;
  scale: number;
}

const DECIMAL_RE = /^\d+(\.\d+)?$/;
const TEN = BigInt(10);
const ZERO = BigInt(0);
const HUNDRED = BigInt(100);
const TEN_THOUSAND = BigInt(10000);

/** Convert an extracted value to a plain non-negative decimal string, or null. */
export function toDecimalString(value: number | string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number' && !Number.isFinite(value)) return null;
  const text = String(value).trim();
  return DECIMAL_RE.test(text) ? text : null;
}

function parse(text: string): ScaledDecimal {
  const [whole, frac = ''] = text.split('.');
  return { value: BigInt(whole + frac), scale: frac.length };
}

function pow10(n: number): bigint {
  let r = BigInt(1);
  for (let i = 0; i < n; i++) r *= TEN;
  return r;
}

function align(a: ScaledDecimal, b: ScaledDecimal): [bigint, bigint] {
  const scale = Math.max(a.scale, b.scale);
  return [a.value * pow10(scale - a.scale), b.value * pow10(scale - b.scale)];
}

function multiply(a: ScaledDecimal, b: ScaledDecimal): ScaledDecimal {
  return { value: a.value * b.value, scale: a.scale + b.scale };
}

function add(a: ScaledDecimal, b: ScaledDecimal): ScaledDecimal {
  const scale = Math.max(a.scale, b.scale);
  const [x, y] = align(a, b);
  return { value: x + y, scale };
}

function formatHundredths(hundredths: bigint): string {
  const whole = hundredths / HUNDRED;
  const frac = (hundredths % HUNDRED).toString().padStart(2, '0').replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : whole.toString();
}

/**
 * Exact percentage `tax / net × 100` with at most 2 decimals, or null when the
 * result is not exact, the net is zero, or the rate is outside 0–100.
 */
export function deriveExactTaxPercent(net: string, tax: string): string | null {
  if (!DECIMAL_RE.test(net) || !DECIMAL_RE.test(tax)) return null;
  const [n, t] = align(parse(net), parse(tax));
  if (n === ZERO) return null;
  const numerator = t * TEN_THOUSAND;
  if (numerator % n !== ZERO) return null;
  const hundredths = numerator / n;
  if (hundredths > HUNDRED * HUNDRED) return null;
  return formatHundredths(hundredths);
}

function isPositive(text: string | null): text is string {
  return text !== null && parse(text).value > ZERO;
}

/** Resolve tax percentages for scanned line items (see module comment). */
export function resolveScanLineTaxes(
  lines: ScanLineTaxInput[],
  header?: ScanHeaderTaxInput,
): ResolvedScanLineTax[] {
  const nets = lines.map((l) => {
    const q = toDecimalString(l.quantity);
    const p = toDecimalString(l.unitPrice);
    return q !== null && p !== null ? multiply(parse(q), parse(p)) : null;
  });
  const netText = (n: ScaledDecimal): string => {
    const s = n.value.toString().padStart(n.scale + 1, '0');
    return n.scale ? `${s.slice(0, -n.scale)}.${s.slice(-n.scale)}` : s;
  };

  const resolved: ResolvedScanLineTax[] = lines.map((line, i) => {
    const extractedTaxAmount = toDecimalString(line.taxAmount);
    const net = nets[i];
    const percent =
      net && isPositive(extractedTaxAmount)
        ? deriveExactTaxPercent(netText(net), extractedTaxAmount)
        : null;
    return {
      taxRatePercent: percent ?? '',
      unresolved: percent === null,
      source: percent === null ? null : 'line',
      extractedTaxAmount,
    };
  });

  // Document-level fallback: when NO line carries a tax amount, a single exact
  // header rate applies only if the line nets add up to the extracted subtotal.
  const noLineTax = lines.every((l) => !isPositive(toDecimalString(l.taxAmount)));
  const subtotal = toDecimalString(header?.subtotal);
  const headerTax = toDecimalString(header?.tax);
  if (
    lines.length > 0 &&
    noLineTax &&
    nets.every((n) => n !== null) &&
    subtotal !== null &&
    isPositive(headerTax)
  ) {
    const sum = (nets as ScaledDecimal[]).reduce(add, { value: ZERO, scale: 0 });
    const [s, h] = align(sum, parse(subtotal));
    const percent = s === h ? deriveExactTaxPercent(subtotal, headerTax) : null;
    if (percent !== null) {
      return resolved.map((r) => ({
        ...r,
        taxRatePercent: percent,
        unresolved: false,
        source: 'document' as const,
      }));
    }
  }

  return resolved;
}
