import type { PossibleDuplicateDraft } from '@mizano/shared-types';
import { toDecimalString } from '@/lib/document-intake-tax';
import type { DocumentIntakeResult } from '@/lib/hooks/use-ai-document-intake';

type ScanFields = Pick<
  DocumentIntakeResult['extractedFields'],
  'vendorName' | 'total' | 'date' | 'currency'
>;

const CURRENCY_RE = /^[A-Za-z]{3}$/;

function isCalendarDate(value: string): boolean {
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/**
 * Duplicate-check input for a completed intake: the selected vendor (else the extracted name),
 * the extracted total, document date and currency. Values that were not read cleanly are left
 * out, so the API answers "unknown" instead of guessing.
 */
export function scanDuplicateDraft(fields: ScanFields, vendorId: string): PossibleDuplicateDraft {
  const draft: PossibleDuplicateDraft = {};
  const vendorName = fields.vendorName?.trim();
  if (vendorId) draft.vendorId = vendorId;
  else if (vendorName) draft.vendorName = vendorName;
  const amount = toDecimalString(fields.total);
  if (amount) draft.amount = amount;
  if (fields.date && isCalendarDate(fields.date)) draft.date = fields.date;
  if (fields.currency && CURRENCY_RE.test(fields.currency)) {
    draft.currency = fields.currency.toUpperCase();
  }
  return draft;
}
