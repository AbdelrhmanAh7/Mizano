import Decimal from 'decimal.js';

export interface AmountMatch {
  value: Decimal;
  raw: string;
  index: number;
  end: number;
  /** Followed by a percent sign (a rate, not a money amount). */
  isPercent: boolean;
}

const MAX_INTEGER_DIGITS = 15;
// Digits joined by ',' or '.' form one token so 1.234,56 is not split at the dot.
const AMOUNT_RE = /\d(?:[\d,.]*\d)?|\.\d+/g;

/**
 * Parse one numeric token whose digits are already ASCII.
 * Rules: when both ',' and '.' occur the last one is the decimal separator;
 * a lone '.' is decimal; a lone ',' is thousands if followed by exactly three
 * digits (or repeated), else decimal. Returns null when unusable.
 */
export function parseAmount(raw: string): Decimal | null {
  const token = raw.replace(/\s+/g, '');
  if (!/^\d[\d,.]*$|^\.\d+$/.test(token)) return null;
  const lastComma = token.lastIndexOf(',');
  const lastDot = token.lastIndexOf('.');
  let intPart: string;
  let fracPart = '';
  if (lastComma >= 0 && lastDot >= 0) {
    const decIdx = Math.max(lastComma, lastDot);
    intPart = token.slice(0, decIdx).replace(/[,.]/g, '');
    fracPart = token.slice(decIdx + 1);
  } else if (lastDot >= 0) {
    if (token.indexOf('.') !== lastDot) {
      intPart = token.replace(/\./g, '');
    } else {
      intPart = token.slice(0, lastDot);
      fracPart = token.slice(lastDot + 1);
    }
  } else if (lastComma >= 0) {
    const after = token.length - lastComma - 1;
    if (token.indexOf(',') !== lastComma || after === 3) {
      intPart = token.replace(/,/g, '');
    } else {
      intPart = token.slice(0, lastComma);
      fracPart = token.slice(lastComma + 1);
    }
  } else {
    intPart = token;
  }
  if (intPart === '') intPart = '0';
  if (!/^\d+$/.test(intPart) || (fracPart !== '' && !/^\d+$/.test(fracPart))) return null;
  if (intPart.replace(/^0+(?=\d)/, '').length > MAX_INTEGER_DIGITS || fracPart.length > 4) {
    return null;
  }
  return new Decimal(fracPart ? `${intPart}.${fracPart}` : intPart);
}

/** All numeric tokens on a (digit-normalized) line. */
export function findAmounts(line: string): AmountMatch[] {
  const out: AmountMatch[] = [];
  for (const m of line.matchAll(AMOUNT_RE)) {
    const raw = m[0].replace(/[,.]+$/, '');
    const value = parseAmount(raw);
    if (!value) continue;
    const index = m.index ?? 0;
    const end = index + m[0].length;
    out.push({
      value,
      raw,
      index,
      end,
      isPercent: line.slice(end).trimStart().startsWith('%'),
    });
  }
  return out;
}
