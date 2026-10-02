import { Decimal } from '@prisma/client/runtime/library';
import { computeDocumentTotals, round } from '../../../common/utils/document-totals';
import { DECIMAL_STRING_PATTERN, PERCENT_STRING_PATTERN } from '../dto/document-intake.dto';
import { DocumentIntakeResult, ConfirmIntakeInput } from '../services/document-intake.service';

export type IntakeBlockerCode =
  | 'NO_RESULT'
  | 'NOT_BILL'
  | 'NO_VENDOR'
  | 'NO_DATE'
  | 'NO_TOTAL'
  | 'NO_LINES'
  | 'INVALID_LINE'
  | 'TAX_UNRESOLVED'
  | 'TOTAL_MISMATCH'
  | 'CURRENCY_MISMATCH';

const BLOCKER_TEXT: Record<IntakeBlockerCode, string> = {
  NO_RESULT: 'No extraction result is available',
  NOT_BILL: 'The document is not classified as a bill',
  NO_VENDOR: 'No existing vendor was matched',
  NO_DATE: 'The document date is missing or invalid',
  NO_TOTAL: 'The document total is missing',
  NO_LINES: 'No line items were extracted',
  INVALID_LINE: 'A line item has a missing quantity or price',
  TAX_UNRESOLVED: 'The tax rate could not be determined exactly',
  TOTAL_MISMATCH: 'Line totals do not reconcile with the document total',
  CURRENCY_MISMATCH: 'The document currency differs from the organization base currency',
};

export type BillConfirmation =
  | { ok: true; input: ConfirmIntakeInput }
  | { ok: false; code: IntakeBlockerCode; reason: string };

export interface BillConfirmationOptions {
  /** Organization base currency; a document in another currency is blocked (single-currency ledger). */
  baseCurrency?: string | null;
}

/** Largest accepted difference between the recomputed gross and the extracted total (vendor rounding). */
const TOTAL_TOLERANCE = new Decimal('0.01');

const blocked = (code: IntakeBlockerCode): BillConfirmation => ({
  ok: false,
  code,
  reason: BLOCKER_TEXT[code],
});

function dec(value: unknown): Decimal | null {
  if (value === null || value === undefined || value === '') return null;
  try {
    const d = new Decimal(String(value));
    return d.isFinite() ? d : null;
  } catch {
    return null;
  }
}

/** Plain (non-exponent) decimal string that passes the same bound as the confirm DTO, or null. */
function boundedString(value: Decimal, pattern: RegExp): string | null {
  const text = value.toFixed();
  return pattern.test(text) ? text : null;
}

/** Exact percentage (<= 2 dp, 0 < p <= 100) of tax over net, or null when not exact. */
function exactPercent(net: Decimal, tax: Decimal): Decimal | null {
  if (net.lte(0) || tax.lte(0)) return null;
  const pct = tax.mul(100).div(net);
  const rounded = pct.toDecimalPlaces(2);
  if (!pct.equals(rounded) || rounded.gt(100)) return null;
  return rounded;
}

function validDate(value: string | null | undefined): string | null {
  if (!value || Number.isNaN(new Date(value).getTime())) return null;
  return value;
}

function normalizeCurrency(value: string | null | undefined): string | null {
  const code = value?.trim().toUpperCase();
  return code ? code : null;
}

/**
 * Builds the confirm payload for a stored extraction, or says why the record needs a human.
 * Money is Decimal end to end and bounded like the confirm DTO; a tax rate is only taken when
 * it is exact (never a silent 0); the totals are recomputed with the same shared calculator the
 * server stores (`computeDocumentTotals`) and must reconcile with the extracted total; and the
 * currency must be the organization base currency when one is given.
 */
export function buildBillConfirmation(
  result: DocumentIntakeResult | null | undefined,
  options: BillConfirmationOptions = {},
): BillConfirmation {
  if (!result || !result.extractedFields) return blocked('NO_RESULT');
  if (result.documentType !== 'BILL') return blocked('NOT_BILL');
  const fields = result.extractedFields;
  if (!result.matchedVendor?.id) return blocked('NO_VENDOR');
  const date = validDate(fields.date);
  if (!date) return blocked('NO_DATE');
  const total = dec(fields.total);
  if (!total) return blocked('NO_TOTAL');
  const items = Array.isArray(fields.lineItems) ? fields.lineItems : [];
  if (items.length === 0) return blocked('NO_LINES');

  const currency = normalizeCurrency(fields.currency);
  const base = normalizeCurrency(options.baseCurrency);
  if (currency && base && currency !== base) return blocked('CURRENCY_MISMATCH');

  const nets: Decimal[] = [];
  const quantities: string[] = [];
  const rates: string[] = [];
  for (const item of items) {
    const q = dec(item.quantity);
    const p = dec(item.unitPrice);
    if (!q || !p || q.lte(0) || p.lt(0) || !item.description) return blocked('INVALID_LINE');
    const quantity = boundedString(q, DECIMAL_STRING_PATTERN);
    const rate = boundedString(p, DECIMAL_STRING_PATTERN);
    if (!quantity || !rate) return blocked('INVALID_LINE');
    // Net rounded per line exactly like the server calculator.
    nets.push(round(q.mul(p)));
    quantities.push(quantity);
    rates.push(rate);
  }

  const lineTaxes = items.map((i) => dec(i.taxAmount));
  const anyLineTax = lineTaxes.some((t) => t !== null && t.gt(0));
  const percents: Decimal[] = [];
  if (anyLineTax) {
    for (let i = 0; i < items.length; i++) {
      const t = lineTaxes[i];
      const pct = t ? exactPercent(nets[i], t) : null;
      if (!pct) return blocked('TAX_UNRESOLVED');
      percents.push(pct);
    }
  } else {
    // Document-level fallback: one exact header rate, only when the nets add up to the subtotal.
    const subtotal = dec(fields.subtotal);
    const headerTax = dec(fields.tax);
    const netSum = nets.reduce((s, n) => s.add(n), new Decimal(0));
    const pct =
      subtotal && headerTax && subtotal.equals(netSum) ? exactPercent(subtotal, headerTax) : null;
    if (!pct) return blocked('TAX_UNRESOLVED');
    items.forEach(() => percents.push(pct));
  }

  const taxRatePercents: string[] = [];
  for (const pct of percents) {
    const text = boundedString(pct, PERCENT_STRING_PATTERN);
    if (!text) return blocked('TAX_UNRESOLVED');
    taxRatePercents.push(text);
  }

  const totals = computeDocumentTotals(
    quantities.map((quantity, i) => ({
      quantity,
      rate: rates[i],
      taxRatePercent: taxRatePercents[i],
    })),
  );
  if (totals.grandTotal.minus(total).abs().gt(TOTAL_TOLERANCE)) return blocked('TOTAL_MISMATCH');

  return {
    ok: true,
    input: {
      type: 'BILL',
      vendorId: result.matchedVendor.id,
      date,
      dueDate: validDate(fields.dueDate) ?? date,
      ...(fields.documentNumber ? { reference: fields.documentNumber } : {}),
      ...(currency ? { currencyCode: currency } : {}),
      lines: items.map((item, i) => ({
        description: item.description,
        quantity: quantities[i],
        rate: rates[i],
        taxRatePercent: taxRatePercents[i],
      })),
    },
  };
}
