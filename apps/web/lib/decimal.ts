/**
 * Exact arithmetic on decimal money strings for client-side checks (allocation sums, remaining
 * balances, report differences). Values are parsed into BigInt scaled by 10^4 — the API's money
 * precision (Decimal(19, 4)) — so comparisons match the server's Decimal comparisons exactly.
 * Never use these results as the source of truth for posted amounts; the API recomputes them.
 */

export const DECIMAL_SCALE = 4;

const DECIMAL_RE = /^\s*([+-])?(\d*)(?:\.(\d*))?\s*$/;
const ZERO = BigInt(0);
const ONE = BigInt(1);
const TEN = BigInt(10);
const FACTOR = pow10(DECIMAL_SCALE);

function pow10(n: number): bigint {
  let r = ONE;
  for (let i = 0; i < n; i++) r *= TEN;
  return r;
}

type DecimalLike = string | number | null | undefined;

/**
 * Parses a decimal string (or a finite number) into an integer scaled by 10^4.
 * Returns null for empty or malformed input and for more than 4 fractional digits
 * (the API cannot store them, so they must not be silently truncated).
 */
export function parseDecimal(value: DecimalLike): bigint | null {
  if (value === null || value === undefined) return null;
  const text = typeof value === 'number' ? (Number.isFinite(value) ? String(value) : '') : value;
  const match = DECIMAL_RE.exec(text);
  if (!match) return null;
  const [, sign, whole = '', frac = ''] = match;
  if (whole === '' && frac === '') return null;
  if (frac.length > DECIMAL_SCALE) return null;
  const scaled = BigInt(whole || '0') * FACTOR + BigInt(frac.padEnd(DECIMAL_SCALE, '0') || '0');
  return sign === '-' ? -scaled : scaled;
}

/** Like parseDecimal but treats empty/invalid input as zero. */
export function toScaled(value: DecimalLike): bigint {
  return parseDecimal(value) ?? ZERO;
}

/**
 * Formats a scaled value as a decimal string with at least `minFractionDigits` digits and no
 * trailing zeros beyond that ("1150.0000" -> "1150.00", "10.1250" -> "10.125").
 */
export function formatScaled(value: bigint, minFractionDigits = 2): string {
  const negative = value < ZERO;
  const abs = negative ? -value : value;
  const whole = abs / FACTOR;
  let frac = (abs % FACTOR).toString().padStart(DECIMAL_SCALE, '0');
  while (frac.length > minFractionDigits && frac.endsWith('0')) frac = frac.slice(0, -1);
  const body = frac.length > 0 ? `${whole}.${frac}` : `${whole}`;
  return negative && abs !== ZERO ? `-${body}` : body;
}

/** Canonical decimal string for display/transport ("1150" -> "1150.00"). Invalid -> "0.00". */
export function normalizeDecimal(value: DecimalLike, minFractionDigits = 2): string {
  return formatScaled(toScaled(value), minFractionDigits);
}

/** Exact sum of decimal values (invalid entries count as zero). */
export function sumDecimals(values: DecimalLike[]): string {
  return formatScaled(values.reduce<bigint>((s, v) => s + toScaled(v), ZERO));
}

/** Exact a - b. */
export function subtractDecimals(a: DecimalLike, b: DecimalLike): string {
  return formatScaled(toScaled(a) - toScaled(b));
}

/** -1 when a < b, 0 when equal, 1 when a > b (exact). */
export function compareDecimals(a: DecimalLike, b: DecimalLike): -1 | 0 | 1 {
  const diff = toScaled(a) - toScaled(b);
  if (diff === ZERO) return 0;
  return diff < ZERO ? -1 : 1;
}

/** True when the value parses and is strictly greater than zero. */
export function isPositiveDecimal(value: DecimalLike): boolean {
  const parsed = parseDecimal(value);
  return parsed !== null && parsed > ZERO;
}

/** True when the value is (or parses to) exactly zero; empty/invalid input counts as zero. */
export function isZeroDecimal(value: DecimalLike): boolean {
  return toScaled(value) === ZERO;
}

/** The smaller of two decimal values. */
export function minDecimal(a: DecimalLike, b: DecimalLike): string {
  return compareDecimals(a, b) <= 0 ? normalizeDecimal(a) : normalizeDecimal(b);
}

/** Absolute value. */
export function absDecimal(value: DecimalLike): string {
  const scaled = toScaled(value);
  return formatScaled(scaled < ZERO ? -scaled : scaled);
}

/**
 * Display-only conversion for Intl formatting. Never feed the result back into arithmetic or
 * an API payload; use the decimal string instead.
 */
export function decimalToDisplayNumber(value: DecimalLike): number {
  const n = Number(normalizeDecimal(value, 0));
  return Number.isFinite(n) ? n : 0;
}
