import Decimal from 'decimal.js';
import { normalizeDigits } from '../extraction/rules/rules-normalize';

export type FieldStatus = 'valid' | 'warning' | 'invalid' | 'missing';
export type TaxCountry = 'EG' | 'SA' | 'AE';

export interface FieldEvidence {
  /** Source line. Document content: never log it. */
  text: string;
  lineIndex: number;
}

export interface FieldValidation {
  /** Display value (money as a fixed 4-dp string). Document content: never log it. */
  value: string | null;
  status: FieldStatus;
  /** Stable machine codes; the web maps them to localized text. */
  reasons: string[];
  evidence?: FieldEvidence;
}

export const VALIDATED_FIELDS = [
  'invoiceNumber',
  'date',
  'currency',
  'subtotal',
  'tax',
  'total',
  'vendorTaxId',
  'vendor',
] as const;
export type ValidatedField = (typeof VALIDATED_FIELDS)[number];

export interface ExtractionValidation {
  fields: Record<ValidatedField, FieldValidation>;
  /** Fields that are invalid, or required (date, total, currency) and missing. */
  blockingFields: ValidatedField[];
  requiresReview: boolean;
}

export interface ValidationInput {
  invoiceNumber: string | null;
  date: string | null;
  currency: string | null;
  subtotal: number | null;
  tax: number | null;
  total: number | null;
  vendorTaxId: string | null;
  extractionWarnings?: string[];
  fieldEvidence?: Record<string, FieldEvidence>;
}

export interface ValidationContext {
  baseCurrency: string;
  /** True when a vendor of this organization carries the extracted tax ID. */
  vendorMatchedByTaxId: boolean;
  now?: Date;
}

const REQUIRED: ValidatedField[] = ['date', 'total', 'currency'];
const TOTALS_TOLERANCE = new Decimal('0.01');
const RATE_TOLERANCE = new Decimal('0.6');
const MAX_AMOUNT = new Decimal(10).pow(15);
const FUTURE_DAYS = 7;
const MIN_YEAR = 2000;
const VAT_RATE: Record<TaxCountry, Decimal> = {
  EG: new Decimal(14),
  SA: new Decimal(15),
  AE: new Decimal(5),
};
const CURRENCY_COUNTRY: Record<string, TaxCountry> = { EGP: 'EG', SAR: 'SA', AED: 'AE' };
const INVOICE_NUMBER_RE = /^[\p{L}\p{N}][\p{L}\p{N}\-/_.#\s]{0,63}$/u;

function finish(
  value: string | null,
  reasons: string[],
  status: FieldStatus,
  evidence?: FieldEvidence,
): FieldValidation {
  return evidence ? { value, status, reasons, evidence } : { value, status, reasons };
}

function clean(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function validateInvoiceNumber(
  value: string | null,
  evidence?: FieldEvidence,
): FieldValidation {
  const v = clean(value);
  if (!v) return finish(null, ['INVOICE_NUMBER_MISSING'], 'missing', evidence);
  if (!INVOICE_NUMBER_RE.test(v) || !/[\p{L}\p{N}]/u.test(v)) {
    return finish(v, ['INVOICE_NUMBER_FORMAT'], 'invalid', evidence);
  }
  return finish(v, [], 'valid', evidence);
}

export function validateDate(
  value: string | null,
  ambiguous: boolean,
  now: Date,
  evidence?: FieldEvidence,
): FieldValidation {
  const v = clean(value);
  if (!v) return finish(null, ['DATE_MISSING'], 'missing', evidence);
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T|$)/.exec(v);
  if (!m || (v.length > 10 && Number.isNaN(Date.parse(v))))
    return finish(v, ['DATE_INVALID'], 'invalid', evidence);
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) {
    return finish(v, ['DATE_INVALID'], 'invalid', evidence);
  }
  const reasons: string[] = [];
  if (y < MIN_YEAR) reasons.push('DATE_TOO_OLD');
  const limit = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + FUTURE_DAYS);
  if (dt.getTime() > limit) reasons.push('DATE_IN_FUTURE');
  if (reasons.length > 0) return finish(v, reasons, 'invalid', evidence);
  if (ambiguous) return finish(v, ['DATE_AMBIGUOUS'], 'warning', evidence);
  return finish(v, [], 'valid', evidence);
}

export function validateCurrency(
  value: string | null,
  baseCurrency: string,
  evidence?: FieldEvidence,
): FieldValidation {
  const v = clean(value)?.toUpperCase() ?? null;
  if (!v) return finish(null, ['CURRENCY_MISSING'], 'missing', evidence);
  if (v !== baseCurrency.trim().toUpperCase()) {
    return finish(v, ['CURRENCY_NOT_BASE'], 'invalid', evidence);
  }
  return finish(v, [], 'valid', evidence);
}

/** Parse an extracted amount; null for a missing value, `'bad'` for a non-finite one. */
function toDecimal(value: number | null): Decimal | null | 'bad' {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'bad';
  return new Decimal(value);
}

export function validateAmount(value: number | null, evidence?: FieldEvidence): FieldValidation {
  const d = toDecimal(value);
  if (d === null) return finish(null, ['AMOUNT_MISSING'], 'missing', evidence);
  if (d === 'bad') return finish(null, ['AMOUNT_NOT_NUMERIC'], 'invalid', evidence);
  const display = d.toFixed(4);
  if (d.isNegative()) return finish(display, ['AMOUNT_NEGATIVE'], 'invalid', evidence);
  if (d.gte(MAX_AMOUNT)) return finish(display, ['AMOUNT_OUT_OF_RANGE'], 'invalid', evidence);
  if (d.decimalPlaces() > 4) return finish(display, ['AMOUNT_PRECISION'], 'warning', evidence);
  return finish(display, [], 'valid', evidence);
}

/** Digits only after stripping separators; null when other characters remain. */
function taxDigits(value: string): string | null {
  const stripped = normalizeDigits(value).replace(/[\s\-.]/g, '');
  return /^\d+$/.test(stripped) ? stripped : null;
}

/** Format rules (no public checksum exists for these registers). */
export function taxIdMatchesCountry(digits: string, country: TaxCountry): boolean {
  if (country === 'EG') return /^\d{9}$/.test(digits);
  if (country === 'SA') return /^3\d{13}3$/.test(digits);
  return /^\d{15}$/.test(digits);
}

export function validateTaxId(
  value: string | null,
  countryHint: TaxCountry | null,
  evidence?: FieldEvidence,
): FieldValidation {
  const v = clean(value);
  if (!v) return finish(null, ['TAX_ID_MISSING'], 'missing', evidence);
  const digits = taxDigits(v);
  const countries: TaxCountry[] = countryHint ? [countryHint] : ['EG', 'SA', 'AE'];
  if (!digits || !countries.some((c) => taxIdMatchesCountry(digits, c))) {
    return finish(v, ['TAX_ID_FORMAT'], 'invalid', evidence);
  }
  return finish(v, [], 'valid', evidence);
}

function mark(f: FieldValidation, code: string, status: FieldStatus): FieldValidation {
  return {
    ...f,
    status: f.status === 'invalid' ? 'invalid' : status,
    reasons: [...f.reasons, code],
  };
}

function rateWarning(tax: Decimal, subtotal: Decimal, country: TaxCountry | null): boolean {
  if (!country || subtotal.isZero() || tax.isZero()) return false;
  const rate = tax.div(subtotal).mul(100);
  return rate.minus(VAT_RATE[country]).abs().gt(RATE_TOLERANCE);
}

export function validateExtraction(
  input: ValidationInput,
  ctx: ValidationContext,
): ExtractionValidation {
  const now = ctx.now ?? new Date();
  const ev = input.fieldEvidence ?? {};
  const ambiguous = input.extractionWarnings?.includes('DATE_AMBIGUOUS') ?? false;
  const currencyCountry = CURRENCY_COUNTRY[ctx.baseCurrency.trim().toUpperCase()] ?? null;

  let subtotal = validateAmount(input.subtotal, ev.subtotal);
  let tax = validateAmount(input.tax, ev.tax);
  let total = validateAmount(input.total, ev.total);

  const parsed = [input.subtotal, input.tax, input.total].map(toDecimal);
  const [sub, vat, tot] = parsed;
  const usable = (d: Decimal | null | 'bad'): d is Decimal =>
    d instanceof Decimal && !d.isNegative();
  if (usable(sub) && usable(vat) && usable(tot)) {
    if (sub.plus(vat).minus(tot).abs().gt(TOTALS_TOLERANCE)) {
      subtotal = mark(subtotal, 'TOTALS_MISMATCH', 'invalid');
      tax = mark(tax, 'TOTALS_MISMATCH', 'invalid');
      total = mark(total, 'TOTALS_MISMATCH', 'invalid');
    } else if (rateWarning(vat, sub, currencyCountry)) {
      tax = mark(tax, 'VAT_RATE_UNEXPECTED', 'warning');
    }
  }

  const vendorTaxId = validateTaxId(input.vendorTaxId, currencyCountry, ev.vendorTaxId);
  let vendor: FieldValidation;
  if (vendorTaxId.status === 'missing') {
    vendor = finish(null, ['VENDOR_TAX_ID_MISSING'], 'missing');
  } else if (vendorTaxId.status === 'invalid') {
    vendor = finish(vendorTaxId.value, ['VENDOR_NOT_MATCHED'], 'warning');
  } else if (ctx.vendorMatchedByTaxId) {
    vendor = finish(vendorTaxId.value, ['VENDOR_MATCHED_BY_TAX_ID'], 'valid');
  } else {
    vendor = finish(vendorTaxId.value, ['VENDOR_NOT_MATCHED'], 'warning');
  }

  const fields: Record<ValidatedField, FieldValidation> = {
    invoiceNumber: validateInvoiceNumber(input.invoiceNumber, ev.invoiceNumber),
    date: validateDate(input.date, ambiguous, now, ev.date),
    currency: validateCurrency(input.currency, ctx.baseCurrency, ev.currency),
    subtotal,
    tax,
    total,
    vendorTaxId,
    vendor,
  };
  const blockingFields = VALIDATED_FIELDS.filter(
    (k) =>
      fields[k].status === 'invalid' || (fields[k].status === 'missing' && REQUIRED.includes(k)),
  );
  return { fields, blockingFields, requiresReview: blockingFields.length > 0 };
}
