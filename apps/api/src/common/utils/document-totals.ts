import { BadRequestException } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';

/**
 * Single source of truth for document (bill / invoice / scanned draft) totals.
 *
 * Rules (shared by manual entry, scan confirmation and bulk paths):
 * - `taxRatePercent` is a percentage (14 => 14%), never an amount.
 * - Line net   = quantity × rate × (1 − discountPercent / 100), rounded to currency minor units.
 * - Line tax   = line net × taxRatePercent / 100, rounded per line (ROUND_HALF_UP).
 * - Subtotal   = Σ line net; taxAmount = Σ line tax; grandTotal = subtotal + taxAmount + shipping.
 *
 * All arithmetic uses Decimal; inputs are accepted as decimal strings to avoid float transport.
 */
export type DecimalInput = Decimal | string | number;

export interface DocumentLineInput {
  quantity: DecimalInput;
  rate: DecimalInput;
  taxRatePercent?: DecimalInput | null;
  discountPercent?: DecimalInput | null;
}

export interface ComputedLine {
  netAmount: Decimal;
  taxAmount: Decimal;
}

export interface DocumentTotals {
  lines: ComputedLine[];
  subtotal: Decimal;
  taxAmount: Decimal;
  shipping: Decimal;
  grandTotal: Decimal;
}

/** Minor units used for rounding. EGP, SAR and AED all use 2. */
export const CURRENCY_SCALE = 2;

function toDecimal(value: DecimalInput | null | undefined, field: string): Decimal {
  if (value === null || value === undefined || value === '') return new Decimal(0);
  try {
    const d = value instanceof Decimal ? value : new Decimal(value);
    if (!d.isFinite()) throw new Error('not finite');
    return d;
  } catch {
    throw new BadRequestException(`${field} must be a valid decimal number`);
  }
}

export function round(value: Decimal, scale = CURRENCY_SCALE): Decimal {
  return value.toDecimalPlaces(scale, Decimal.ROUND_HALF_UP);
}

export function computeLine(line: DocumentLineInput, scale = CURRENCY_SCALE): ComputedLine {
  const quantity = toDecimal(line.quantity, 'quantity');
  const rate = toDecimal(line.rate, 'rate');
  const discount = toDecimal(line.discountPercent, 'discountPercent');
  const taxPercent = toDecimal(line.taxRatePercent, 'taxRatePercent');

  if (quantity.isNegative() || rate.isNegative()) {
    throw new BadRequestException('quantity and rate must not be negative');
  }
  if (discount.isNegative() || discount.greaterThan(100)) {
    throw new BadRequestException('discountPercent must be between 0 and 100');
  }
  if (taxPercent.isNegative() || taxPercent.greaterThan(100)) {
    throw new BadRequestException('taxRatePercent must be between 0 and 100');
  }

  const gross = quantity.mul(rate);
  const netAmount = round(gross.mul(new Decimal(100).sub(discount)).div(100), scale);
  const taxAmount = round(netAmount.mul(taxPercent).div(100), scale);
  return { netAmount, taxAmount };
}

export function computeDocumentTotals(
  lines: DocumentLineInput[],
  options: { shipping?: DecimalInput | null; scale?: number } = {},
): DocumentTotals {
  const scale = options.scale ?? CURRENCY_SCALE;
  const computed = lines.map((l) => computeLine(l, scale));
  const subtotal = computed.reduce((s, l) => s.add(l.netAmount), new Decimal(0));
  const taxAmount = computed.reduce((s, l) => s.add(l.taxAmount), new Decimal(0));
  const shipping = round(toDecimal(options.shipping, 'shipping'), scale);
  if (shipping.isNegative()) throw new BadRequestException('shipping must not be negative');
  return {
    lines: computed,
    subtotal,
    taxAmount,
    shipping,
    grandTotal: subtotal.add(taxAmount).add(shipping),
  };
}
