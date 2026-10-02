import type { ExtractionValidation } from '@/lib/hooks/use-ai-document-intake';

const SCALE = 4;
const TEN_POW_SCALE = BigInt(10 ** SCALE);

export interface IntakeFormSnapshot {
  date: string;
  currencyCode: string;
  lines: Array<{ quantity: string | number; rate: string | number }>;
  /** Date the scan form pre-filled when extraction found none (today). */
  prefilledDate?: string;
}

/** Decimal string -> integer scaled by 10^4; null when malformed or out of range. */
function scaled(value: string): bigint | null {
  const m = /^\s*(\d{1,15})(?:\.(\d{1,4}))?\s*$/.exec(value);
  if (!m) return null;
  return BigInt(m[1] + (m[2] ?? '').padEnd(SCALE, '0'));
}

/** Net of the form lines scaled by 10^8 (quantity x rate), or null when a line is malformed. */
function netScaled(lines: IntakeFormSnapshot['lines']): bigint | null {
  let sum = BigInt(0);
  for (const l of lines) {
    const q = scaled(String(l.quantity));
    const r = scaled(String(l.rate));
    if (q === null || r === null) return null;
    sum += q * r;
  }
  return sum;
}

export const AMOUNT_FIELDS = ['subtotal', 'tax', 'total'];

/**
 * Splits uncorrected blocking fields. The form posts its own line totals, so a header amount
 * mismatch may already be right in the lines (for example a misread total): requiring a change
 * would block a correct bill. Those fields need an explicit acknowledgement instead.
 */
export function partitionBlocking(
  fields: string[],
  validation?: ExtractionValidation,
): { hard: string[]; amounts: string[]; missingDate: boolean } {
  // A missing date still sitting on the form's pre-filled default (today) may be right, so it
  // needs an acknowledgement too; an extracted but invalid date must be changed.
  const missingDate = fields.includes('date') && validation?.fields.date?.status === 'missing';
  return {
    hard: fields.filter((f) => !AMOUNT_FIELDS.includes(f) && !(f === 'date' && missingDate)),
    amounts: fields.filter((f) => AMOUNT_FIELDS.includes(f)),
    missingDate,
  };
}

export function warningFields(validation: ExtractionValidation | undefined): string[] {
  if (!validation) return [];
  return Object.entries(validation.fields)
    .filter(([, f]) => f.status === 'warning')
    .map(([k]) => k);
}

/**
 * Blocking fields the user has not corrected yet. Date and currency count as corrected once
 * the form value differs from the extracted one; amount fields once the line net differs from
 * the extracted subtotal. Fields that cannot be edited in this form (invoice number, tax ID)
 * never block here: the server stays authoritative.
 */
export function uncorrectedBlockingFields(
  validation: ExtractionValidation | undefined,
  extracted: { date: string | null; currency: string | null },
  form: IntakeFormSnapshot,
): string[] {
  if (!validation) return [];
  const net = netScaled(form.lines);
  const subtotalText = validation.fields.subtotal?.value;
  const extractedSubtotal = subtotalText ? scaled(subtotalText) : null;
  return validation.blockingFields.filter((field) => {
    if (field === 'date') {
      if (form.date === (extracted.date ?? '')) return true;
      // No extracted date: the form pre-fills today, which is not a correction by itself.
      return (
        !extracted.date && form.prefilledDate !== undefined && form.date === form.prefilledDate
      );
    }
    if (field === 'currency') {
      return form.currencyCode.toUpperCase() === (extracted.currency ?? '').toUpperCase();
    }
    if (field === 'total' || field === 'subtotal' || field === 'tax') {
      if (net === null || net === BigInt(0)) return true;
      return extractedSubtotal !== null && net === extractedSubtotal * TEN_POW_SCALE;
    }
    return false;
  });
}
