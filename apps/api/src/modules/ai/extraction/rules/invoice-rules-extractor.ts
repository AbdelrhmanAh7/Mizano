import Decimal from 'decimal.js';
import { findAmounts, AmountMatch } from './rules-amounts';
import { parseDate } from './rules-dates';
import { foldForMatch, normalizeDigits, splitLines } from './rules-normalize';

export interface Evidence {
  /** The source line (trimmed, capped). Document content: never log it. */
  text: string;
  lineIndex: number;
}

export interface RuleField<T> {
  value: T;
  /** 0..1. Never invented: derived from how the value was found and cross-checks. */
  confidence: number;
  evidence: Evidence;
}

export type TaxIdCountry = 'EG' | 'SA' | 'AE';
export type CurrencyCode = 'EGP' | 'SAR' | 'AED';

export interface RulesExtraction {
  invoiceNumber: RuleField<string> | null;
  date: RuleField<string> | null;
  dueDate: RuleField<string> | null;
  vendorName: RuleField<string> | null;
  vendorTaxId: (RuleField<string> & { country: TaxIdCountry }) | null;
  subtotal: RuleField<Decimal> | null;
  tax: RuleField<Decimal> | null;
  total: RuleField<Decimal> | null;
  currency: RuleField<CurrencyCode> | null;
  /** Machine codes only (no document text) so they are safe to log. */
  warnings: string[];
  /** 0..1; capped below the review threshold when a consistency check fails. */
  overallConfidence: number;
}

const TOLERANCE = new Decimal('0.01');
const PLAUSIBLE_VAT_RATES = [0, 5, 14, 15].map((r) => new Decimal(r));
const RATE_TOLERANCE = new Decimal('0.6');
const INCONSISTENT_CAP = 0.5;
const SNIPPET_MAX = 160;

const CONF_SAME_LINE = 0.9;
const CONF_NEXT_LINE = 0.75;
const CONF_FALLBACK = 0.5;
/** A day/month-ambiguous date is a guess: keep it below the 0.6 review threshold. */
const AMBIGUOUS_DATE_CAP = 0.5;

function evidence(lines: string[], lineIndex: number): Evidence {
  return { text: lines[lineIndex].trim().slice(0, SNIPPET_MAX), lineIndex };
}

function scale(textConfidence: number): number {
  return 0.5 + 0.5 * Math.min(1, Math.max(0, textConfidence));
}

// Patterns run on folded text (alef/yaa/taa-marbuta normalized, lower-cased).
const SUBTOTAL_RE =
  /sub\s*-?\s*total|total[\s(]*(?:before|excl\w*|excluding|without)[.\s]*(?:vat|tax)|net\s*(?:amount|total)|taxable\s*(?:amount|value|total)|المجموع\s*(?:قبل|غير\s*شامل)|المجموع\s*الفرعي|الاجمالي\s*(?:قبل|غير\s*شامل)|الاجمالي\s*الفرعي|المبلغ\s*قبل|المجموع/;
const TOTAL_INCL_RE =
  /المجموع\s*الكلي|الاجمالي\s*الكلي|(?:total|grand\s*total|amount\s*due)[\s(]*(?:incl\w*|including|with|after|inc)[.\s]*(?:vat|tax)|(?:الاجمالي|المجموع|المبلغ)\s*(?:شامل|بعد)\s*(?:ضريبه|الضريبه)/;
const TOTAL_VAT_RE = /total\s*vat|vat\s*total|(?:الاجمالي|المجموع)\s*(?:ال)?ضريبه/;
const VAT_RE =
  /\bvat\b|value\s*added\s*tax|tax\s*amount|ضريبه\s*القيمه\s*المضافه|القيمه\s*المضافه|ضريبه/;
const TAX_ID_LINE_RE =
  /trn|tax\s*(?:id|reg|no|number)|الرقم\s*الضريبي|رقم\s*التسجيل|vat\s*(?:no|number|id|reg)/;
const TOTAL_RE =
  /\bgrand\s*total\b|\btotal\b|amount\s*due|balance\s*due|الاجمالي|المبلغ\s*المستحق|صافي\s*المبلغ|اجمالي/;

type AmountKey = 'subtotal' | 'tax' | 'total';

const TABLE_HEADER_RE = /\b(?:qty|quantity|price)\b|الكميه|السعر/;

function classifyAmountLine(folded: string): AmountKey | null {
  if (
    TABLE_HEADER_RE.test(folded) &&
    (/\b(?:description|item)\b|\u0627\u0644\u0648\u0635\u0641/.test(folded) ||
      (/\bprice\b|\u0627\u0644\u0633\u0639\u0631/.test(folded) &&
        /\b(?:qty|quantity)\b|\u0627\u0644\u0643\u0645\u064a\u0647/.test(folded)))
  )
    return null;
  if (TOTAL_VAT_RE.test(folded)) return 'tax';
  if (TOTAL_INCL_RE.test(folded)) return 'total';
  if (SUBTOTAL_RE.test(folded)) return 'subtotal';
  if (TAX_ID_LINE_RE.test(folded)) return null;
  if (VAT_RE.test(folded)) return 'tax';
  if (TOTAL_RE.test(folded)) return 'total';
  return null;
}

function lastMoney(amounts: AmountMatch[]): AmountMatch | null {
  const money = amounts.filter((a) => !a.isPercent);
  return money.length ? money[money.length - 1] : null;
}

function findLabeledAmounts(
  lines: string[],
  folded: string[],
  scaleFactor: number,
): Record<AmountKey, RuleField<Decimal> | null> {
  const found: Record<AmountKey, RuleField<Decimal> | null> = {
    subtotal: null,
    tax: null,
    total: null,
  };
  for (let i = 0; i < lines.length; i++) {
    const key = classifyAmountLine(folded[i]);
    if (!key) continue;
    let hit = lastMoney(findAmounts(lines[i]));
    let lineIndex = i;
    let base = CONF_SAME_LINE;
    if (!hit && i + 1 < lines.length) {
      // Column layouts: accept the next line only when it is purely a figure.
      const next = findAmounts(lines[i + 1]);
      const rest = lines[i + 1].replace(/[\d.,\s%]/g, '');
      const currencyOnly =
        rest.length === 0 || /^(?:[A-Za-z]{2,4}\.?|ج\.?م\.?|ر\.?س\.?|د\.?إ\.?)$/.test(rest);
      if (next.length === 1 && !next[0].isPercent && currencyOnly) {
        hit = next[0];
        lineIndex = i + 1;
        base = CONF_NEXT_LINE;
      }
    }
    if (!hit) continue;
    // Later occurrences win: summary blocks sit at the bottom of an invoice.
    found[key] = {
      value: hit.value,
      confidence: base * scaleFactor,
      evidence: evidence(lines, lineIndex),
    };
  }
  return found;
}

const INVOICE_NO_AFTER_RE =
  /(?:invoice\s*(?:no|number|num|#)|inv\s*(?:no|#)|tax\s*invoice\s*(?:no|number)|رقم\s*الفاتوره|فاتوره\s*(?:ضريبيه\s*)?رقم|رقم\s*المستند)[\s.:#-]*([a-z0-9][a-z0-9\-/_.]{0,30})/i;
const INVOICE_NO_BEFORE_RE =
  /([a-z0-9][a-z0-9\-/_.]{0,30})\s*[:-]?\s*(?:رقم\s*الفاتوره|رقم\s*المستند)/i;
const INVOICE_NO_LABEL_ONLY_RE = /^\s*(?:invoice\s*(?:no|number|#)\.?|رقم\s*الفاتوره)\s*[:#]?\s*$/i;

function cleanToken(t: string): string {
  return t.replace(/[.\-/_]+$/, '');
}

function extractInvoiceNumber(
  lines: string[],
  folded: string[],
  scaleFactor: number,
): RuleField<string> | null {
  for (let i = 0; i < lines.length; i++) {
    for (const re of [INVOICE_NO_AFTER_RE, INVOICE_NO_BEFORE_RE]) {
      const m = folded[i].match(re);
      if (!m) continue;
      const token = cleanToken(m[1]);
      if (!/\d/.test(token)) continue;
      // Folding only lower-cases ASCII, so offsets match the original line.
      const at = (m.index ?? 0) + m[0].indexOf(m[1]);
      return {
        value: cleanToken(lines[i].slice(at, at + m[1].length)),
        confidence: CONF_SAME_LINE * scaleFactor,
        evidence: evidence(lines, i),
      };
    }
    if (INVOICE_NO_LABEL_ONLY_RE.test(folded[i]) && i + 1 < lines.length) {
      const t = lines[i + 1].trim();
      if (/^[A-Za-z0-9][A-Za-z0-9\-/_.]{0,30}$/.test(t) && /\d/.test(t)) {
        return {
          value: cleanToken(t),
          confidence: CONF_NEXT_LINE * scaleFactor,
          evidence: evidence(lines, i + 1),
        };
      }
    }
  }
  return null;
}

const DUE_LABEL_RE = /due\s*date|payment\s*due|تاريخ\s*الاستحقاق|الاستحقاق/;
const DATE_LABEL_RE =
  /invoice\s*date|issue\s*date|date\s*of\s*issue|\bdate\b|تاريخ\s*الفاتوره|تاريخ\s*الاصدار|التاريخ|تاريخ/;

function extractDates(
  lines: string[],
  folded: string[],
  scaleFactor: number,
): {
  date: RuleField<string> | null;
  dueDate: RuleField<string> | null;
  dateAmbiguous: boolean;
} {
  const ambiguousLines = new Set<number>();
  let date: RuleField<string> | null = null;
  let dueDate: RuleField<string> | null = null;
  const consider = (i: number, base: number): RuleField<string> | null => {
    const d = parseDate(lines[i]);
    if (!d) return null;
    if (d.ambiguous) ambiguousLines.add(i);
    return {
      value: d.iso,
      confidence: d.ambiguous
        ? Math.min(AMBIGUOUS_DATE_CAP, base * scaleFactor)
        : base * scaleFactor,
      evidence: evidence(lines, i),
    };
  };
  for (let i = 0; i < lines.length && !(date && dueDate); i++) {
    const isDue = DUE_LABEL_RE.test(folded[i]);
    const isDate = !isDue && DATE_LABEL_RE.test(folded[i]);
    if (!isDue && !isDate) continue;
    let field = consider(i, CONF_SAME_LINE);
    if (!field && i + 1 < lines.length && !DUE_LABEL_RE.test(folded[i + 1])) {
      field = consider(i + 1, CONF_NEXT_LINE);
    }
    if (!field) continue;
    if (isDue && !dueDate) dueDate = field;
    if (isDate && !date) date = field;
  }
  if (!date) {
    // Unlabeled: first date outside a due-date line, at fallback confidence.
    for (let i = 0; i < lines.length; i++) {
      if (DUE_LABEL_RE.test(folded[i])) continue;
      const field = consider(i, CONF_FALLBACK);
      if (field) {
        date = field;
        break;
      }
    }
  }
  const dateAmbiguous = date !== null && ambiguousLines.has(date.evidence.lineIndex);
  return { date, dueDate, dateAmbiguous };
}

const TAX_ID_LABEL_RE =
  /trn|vat\s*(?:reg\w*\s*)?(?:no|number|id|#)?|tax\s*(?:id|reg\w*|no|number|card)|الرقم\s*الضريبي|رقم\s*التسجيل\s*الضريبي|رقم\s*ضريبي|الرقم\s*المميز|الملف\s*الضريبي/;
const TAX_ID_GROUP_RE = /\d[\d\s-]{7,24}\d/g;

function classifyTaxId(digits: string): { country: TaxIdCountry; base: number } | null {
  if (digits.length === 15) {
    if (digits.startsWith('3') && digits.endsWith('3')) return { country: 'SA', base: 0.95 };
    if (digits.startsWith('100')) return { country: 'AE', base: 0.95 };
    return { country: 'AE', base: 0.6 };
  }
  if (digits.length === 9) return { country: 'EG', base: 0.9 };
  return null;
}

function extractTaxId(
  lines: string[],
  folded: string[],
  warnings: string[],
  scaleFactor: number,
): RulesExtraction['vendorTaxId'] {
  const candidates: Array<{ digits: string; line: number; labeled: boolean }> = [];
  for (let i = 0; i < lines.length; i++) {
    if (!TAX_ID_LABEL_RE.test(folded[i])) continue;
    const before = candidates.length;
    // Skip the label itself, then read digit groups (spaces/dashes allowed inside).
    const afterLabel = lines[i].replace(/%/g, ' ');
    for (const m of afterLabel.matchAll(TAX_ID_GROUP_RE)) {
      const digits = m[0].replace(/\D/g, '');
      if (classifyTaxId(digits)) {
        candidates.push({ digits, line: i, labeled: true });
        continue;
      }
      // The group may have swallowed an adjacent date or phone: try its parts.
      for (const part of m[0].split(/\s+/)) {
        const partDigits = part.replace(/\D/g, '');
        if (classifyTaxId(partDigits))
          candidates.push({ digits: partDigits, line: i, labeled: true });
      }
    }
    if (candidates.length === before) {
      const next = lines[i + 1]?.trim();
      if (next && /^\d[\d\s-]{7,24}\d$/.test(next)) {
        const digits = next.replace(/\D/g, '');
        if (classifyTaxId(digits)) candidates.push({ digits, line: i + 1, labeled: true });
      }
    }
  }
  if (candidates.length === 0) {
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(/(?<!\d)3\d{13}3(?!\d)/);
      if (m) {
        candidates.push({ digits: m[0], line: i, labeled: false });
        break;
      }
    }
  }
  if (candidates.length === 0) return null;
  const first = candidates[0];
  const cls = classifyTaxId(first.digits);
  if (!cls) return null;
  let confidence = (first.labeled ? cls.base : CONF_FALLBACK) * scaleFactor;
  if (new Set(candidates.map((c) => c.digits)).size > 1) {
    // Supplier vs customer cannot be told apart by rules alone.
    confidence = Math.min(confidence, 0.5);
    warnings.push('MULTIPLE_TAX_IDS');
  }
  return {
    value: first.digits,
    country: cls.country,
    confidence,
    evidence: evidence(lines, first.line),
  };
}

const CURRENCY_PATTERNS: Array<[CurrencyCode, RegExp]> = [
  ['EGP', /\begp\b|\bl\.\s?e\b|ج\.\s?م|جنيه/g],
  ['SAR', /\bsar\b|\bsr\b|ر\.\s?س|ريال\s*سعودي/g],
  ['AED', /\baed\b|\bdhs?\b|\bdirhams?\b|د\.\s?ا|درهم/g],
];

function extractCurrency(
  lines: string[],
  folded: string[],
  scaleFactor: number,
): RuleField<CurrencyCode> | null {
  const counts = new Map<CurrencyCode, { n: number; line: number }>();
  folded.forEach((f, i) => {
    for (const [code, re] of CURRENCY_PATTERNS) {
      const n = (f.match(re) ?? []).length;
      if (n > 0) {
        const cur = counts.get(code);
        counts.set(code, { n: (cur?.n ?? 0) + n, line: cur?.line ?? i });
      }
    }
  });
  if (counts.size === 0) return null;
  const ranked = [...counts.entries()].sort((a, b) => b[1].n - a[1].n);
  if (ranked.length > 1 && ranked[0][1].n === ranked[1][1].n) return null; // ambiguous
  const [code, info] = ranked[0];
  return {
    value: code,
    confidence: (ranked.length > 1 ? 0.5 : 0.85) * scaleFactor,
    evidence: evidence(lines, info.line),
  };
}

const VENDOR_LABEL_RE =
  /^\s*(?:supplier|vendor|seller|sold\s*by|issued\s*by|company)(?:\s*name)?\s*[:-]\s*(.*)$|^\s*(?:اسم\s*)?(?:المورد|البائع|اسم\s*الشركه|اسم\s*المنشاه|المنشاه|الشركه)\s*[:-]\s*(.*)$/i;
const VENDOR_SKIP_RE =
  /invoice|فاتوره|tax|ضريب|receipt|ايصال|date|تاريخ|trn|vat|original|copy|page|www\.|@|\d{5,}/;

function extractVendor(
  lines: string[],
  folded: string[],
  scaleFactor: number,
): RuleField<string> | null {
  for (let i = 0; i < lines.length; i++) {
    const m = folded[i].match(VENDOR_LABEL_RE);
    if (!m) continue;
    const value = (m[1] ?? m[2] ?? '').trim();
    if (value.length >= 2) {
      // Folding preserves length, so slice the original line at the same offset.
      const original = lines[i].slice(folded[i].length - (m[1] ?? m[2] ?? '').length).trim();
      return {
        value: original.length >= 2 ? original : value,
        confidence: CONF_SAME_LINE * scaleFactor,
        evidence: evidence(lines, i),
      };
    }
    const next = lines[i + 1]?.trim();
    if (next && next.length >= 2 && !/\d{4,}/.test(next)) {
      return {
        value: next,
        confidence: CONF_NEXT_LINE * scaleFactor,
        evidence: evidence(lines, i + 1),
      };
    }
  }
  // Header heuristic: first plain line near the top. Low confidence; review decides.
  for (let i = 0; i < Math.min(lines.length, 5); i++) {
    const t = lines[i].trim();
    if (t.length >= 3 && t.length <= 80 && !VENDOR_SKIP_RE.test(folded[i]) && /\p{L}{3}/u.test(t)) {
      return { value: t, confidence: 0.4 * scaleFactor, evidence: evidence(lines, i) };
    }
  }
  return null;
}

function scaleDown<T>(field: RuleField<T> | null, factor: number): void {
  if (field) field.confidence = Math.max(0, field.confidence * factor);
}

function checkConsistency(
  r: Pick<RulesExtraction, 'subtotal' | 'tax' | 'total' | 'warnings'>,
): boolean {
  let consistent = true;
  const { subtotal, tax, total } = r;
  if (subtotal && tax && total) {
    const diff = subtotal.value.add(tax.value).sub(total.value).abs();
    if (diff.gt(TOLERANCE)) {
      r.warnings.push('TOTALS_MISMATCH');
      [subtotal, tax, total].forEach((f) => scaleDown(f, 0.5));
      consistent = false;
    }
  }
  if (subtotal && total && subtotal.value.gt(total.value.add(TOLERANCE))) {
    if (!r.warnings.includes('TOTALS_MISMATCH')) {
      r.warnings.push('SUBTOTAL_EXCEEDS_TOTAL');
      scaleDown(subtotal, 0.5);
      scaleDown(total, 0.5);
    }
    consistent = false;
  }
  if (subtotal && tax && subtotal.value.gt(0)) {
    const rate = tax.value.div(subtotal.value).mul(100);
    const plausible = PLAUSIBLE_VAT_RATES.some((p) => rate.sub(p).abs().lte(RATE_TOLERANCE));
    if (!plausible) {
      r.warnings.push('VAT_RATE_IMPLAUSIBLE');
      scaleDown(tax, 0.7);
      consistent = false;
    }
  }
  return consistent;
}

/**
 * Deterministic, dependency-free invoice field extraction over OCR / PDF text.
 * Unknown stays unknown: any field not found with evidence is null, nothing is
 * derived or guessed (a missing total is never computed from subtotal + VAT).
 *
 * @param rawText        OCR or PDF text-layer output
 * @param textConfidence 0..1 confidence of the text source (OCR); defaults to 1
 */
export function extractInvoiceFields(rawText: string, textConfidence = 1): RulesExtraction {
  const lines = splitLines(normalizeDigits(rawText));
  const folded = lines.map(foldForMatch);
  const factor = scale(textConfidence);
  const warnings: string[] = [];

  const amounts = findLabeledAmounts(lines, folded, factor);
  const { date, dueDate, dateAmbiguous } = extractDates(lines, folded, factor);
  if (dateAmbiguous) warnings.push('DATE_AMBIGUOUS');
  const result: RulesExtraction = {
    invoiceNumber: extractInvoiceNumber(lines, folded, factor),
    date,
    dueDate,
    vendorName: extractVendor(lines, folded, factor),
    vendorTaxId: extractTaxId(lines, folded, warnings, factor),
    subtotal: amounts.subtotal,
    tax: amounts.tax,
    total: amounts.total,
    currency: extractCurrency(lines, folded, factor),
    warnings,
    overallConfidence: 0,
  };

  const consistent = checkConsistency(result);

  const core: Array<RuleField<unknown> | null> = [result.total, result.date, result.invoiceNumber];
  const present = core.filter((f): f is RuleField<unknown> => f !== null);
  let overall = present.length ? present.reduce((s, f) => s + f.confidence, 0) / present.length : 0;
  if (!result.total || !result.date) overall = Math.min(overall, 0.5);
  if (!consistent || dateAmbiguous) overall = Math.min(overall, INCONSISTENT_CAP);
  result.overallConfidence = Math.round(overall * 1000) / 1000;
  return result;
}
