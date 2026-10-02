import { readFileSync } from 'fs';
import { join } from 'path';
import { findAmounts, parseAmount } from './rules-amounts';
import { parseDate } from './rules-dates';
import { extractInvoiceFields } from './invoice-rules-extractor';
import { normalizeDigits } from './rules-normalize';
import { toExtractionResult } from '../rules-strategy.service';

const fixture = (name: string): string =>
  readFileSync(join(__dirname, '__fixtures__', name), 'utf8');

describe('rules normalization', () => {
  it('maps Arabic-Indic and Persian digits and separators to ASCII', () => {
    expect(normalizeDigits('١٢٣٤٥٦٧٨٩٠')).toBe('1234567890');
    expect(normalizeDigits('۰۱۲۳۴۵۶۷۸۹')).toBe('0123456789');
    expect(normalizeDigits('١٬٢٣٤٫٥٠ ١٤٪')).toBe('1,234.50 14%');
  });

  it('keeps the line count so evidence line indexes stay valid', () => {
    expect(normalizeDigits('a\n١\n\nb').split('\n')).toHaveLength(4);
  });
});

describe('parseAmount', () => {
  it.each([
    ['1,234.50', '1234.5'],
    ['1,234,567.89', '1234567.89'],
    ['1.234,56', '1234.56'],
    ['1,234', '1234'],
    ['50.00', '50'],
    ['12,5', '12.5'],
  ])('parses %s', (raw, expected) => {
    expect(parseAmount(raw)?.toString()).toBe(expected);
  });

  it('keeps a dot-thousands token whole when scanning a line', () => {
    expect(findAmounts('Total: 1.234,56 EUR').map((a) => a.value.toString())).toEqual(['1234.56']);
    expect(findAmounts('Total: 1.234.567').map((a) => a.value.toString())).toEqual(['1234567']);
  });

  it('rejects values beyond Decimal(19,4) bounds', () => {
    expect(parseAmount('1234567890123456')).toBeNull();
    expect(parseAmount('1.12345')).toBeNull();
  });
});

describe('parseDate', () => {
  it('parses day-first, ISO, and named-month dates', () => {
    expect(parseDate('15/03/2024')).toEqual({ iso: '2024-03-15', ambiguous: false });
    expect(parseDate('2024-06-09')?.iso).toBe('2024-06-09');
    expect(parseDate('12 March 2024')?.iso).toBe('2024-03-12');
    expect(parseDate('9 يونيو 2024')?.iso).toBe('2024-06-09');
    expect(parseDate('3 تشرين الثاني 2024')?.iso).toBe('2024-11-03');
  });

  it('flags day/month ambiguity and rejects impossible or Hijri dates', () => {
    expect(parseDate('01/02/2024')).toEqual({ iso: '2024-02-01', ambiguous: true });
    expect(parseDate('31/02/2024')).toBeNull();
    expect(parseDate('15/03/1445')).toBeNull();
    expect(parseDate('2024-06-09')?.ambiguous).toBe(false);
  });
});

describe('extractInvoiceFields: English fixtures', () => {
  it('extracts an Egyptian invoice with evidence for every field', () => {
    const r = extractInvoiceFields(fixture('en-eg-invoice.txt'));
    expect(r.invoiceNumber?.value).toBe('INV-2024-0042');
    expect(r.date?.value).toBe('2024-03-15');
    expect(r.dueDate?.value).toBe('2024-04-14');
    expect(r.vendorName?.value).toBe('Cairo Office Supplies Co.');
    expect(r.vendorTaxId).toMatchObject({ value: '123456789', country: 'EG' });
    expect(r.subtotal?.value.toString()).toBe('1000');
    expect(r.tax?.value.toString()).toBe('140');
    expect(r.total?.value.toString()).toBe('1140');
    expect(r.currency?.value).toBe('EGP');
    expect(r.warnings).toEqual([]);
    expect(r.total?.evidence).toEqual({ text: 'Total: EGP 1,140.00', lineIndex: 10 });
    for (const f of [r.invoiceNumber, r.date, r.subtotal, r.tax, r.total, r.vendorTaxId]) {
      expect(f?.evidence.text.length).toBeGreaterThan(0);
      expect(f?.confidence).toBeGreaterThan(0.6);
    }
  });

  it('does not take the line-items header or row as the total', () => {
    const r = extractInvoiceFields(fixture('en-eg-invoice.txt'));
    expect(r.total?.evidence.lineIndex).toBe(10);
  });

  it('extracts a Saudi invoice and recognises the 15-digit 3...3 tax id', () => {
    const r = extractInvoiceFields(fixture('en-sa-invoice.txt'));
    expect(r.invoiceNumber?.value).toBe('SA-77/2024');
    expect(r.date?.value).toBe('2024-06-09');
    expect(r.vendorTaxId).toMatchObject({ value: '300123456700003', country: 'SA' });
    expect(r.subtotal?.value.toString()).toBe('2000');
    expect(r.tax?.value.toString()).toBe('300');
    expect(r.total?.value.toString()).toBe('2300');
    expect(r.currency?.value).toBe('SAR');
  });

  it('extracts a UAE invoice with a named-month date and TRN', () => {
    const r = extractInvoiceFields(fixture('en-ae-invoice.txt'));
    expect(r.invoiceNumber?.value).toBe('AE-1009');
    expect(r.date?.value).toBe('2024-03-12');
    expect(r.vendorTaxId).toMatchObject({ value: '100234567800003', country: 'AE' });
    expect(r.total?.value.toString()).toBe('1260');
    expect(r.currency?.value).toBe('AED');
  });
});

describe('extractInvoiceFields: Arabic fixtures', () => {
  it('extracts an Egyptian Arabic invoice with Arabic-Indic digits', () => {
    const r = extractInvoiceFields(fixture('ar-eg-invoice.txt'));
    expect(r.invoiceNumber?.value).toBe('INV-2024-0150');
    expect(r.date?.value).toBe('2024-03-15');
    expect(r.dueDate?.value).toBe('2024-04-14');
    expect(r.vendorTaxId).toMatchObject({ value: '123456789', country: 'EG' });
    expect(r.subtotal?.value.toString()).toBe('1000');
    expect(r.tax?.value.toString()).toBe('140');
    expect(r.total?.value.toString()).toBe('1140');
    expect(r.currency?.value).toBe('EGP');
    expect(r.warnings).toEqual([]);
    expect(r.total?.evidence.lineIndex).toBe(10);
  });

  it('reads label-then-value column layouts and Arabic month names', () => {
    const r = extractInvoiceFields(fixture('ar-sa-invoice.txt'));
    expect(r.invoiceNumber?.value).toBe('SA-77');
    expect(r.date?.value).toBe('2024-06-09');
    expect(r.vendorTaxId).toMatchObject({ value: '300123456700003', country: 'SA' });
    expect(r.subtotal?.value.toString()).toBe('2000');
    expect(r.tax?.value.toString()).toBe('300');
    expect(r.total?.value.toString()).toBe('2300');
    expect(r.currency?.value).toBe('SAR');
    // value came from the line after the label: lower confidence than same-line
    expect(r.tax?.confidence).toBeLessThan(r.subtotal?.confidence ?? 0);
  });
});

describe('extractInvoiceFields: uncertainty', () => {
  it('lowers confidence and warns when subtotal + VAT does not equal total', () => {
    const ok = extractInvoiceFields(fixture('en-sa-invoice.txt'));
    const bad = extractInvoiceFields(fixture('en-mismatch.txt'));
    expect(bad.warnings).toContain('TOTALS_MISMATCH');
    expect(bad.total?.confidence).toBeLessThan(ok.total?.confidence ?? 0);
    expect(bad.overallConfidence).toBeLessThan(0.6);
    expect(ok.overallConfidence).toBeGreaterThanOrEqual(0.6);
  });

  it('never trusts a day/month-ambiguous invoice date', () => {
    const r = extractInvoiceFields(
      'Invoice No: A-1\nDate: 05/06/2024\nSub Total: 100.00\nVAT 15%: 15.00\nTotal: 115.00\n',
    );
    expect(r.date?.value).toBe('2024-06-05');
    expect(r.date?.confidence).toBeLessThan(0.6);
    expect(r.warnings).toContain('DATE_AMBIGUOUS');
    expect(r.overallConfidence).toBeLessThan(0.6);
  });

  it('finds a tax id when a date or phone follows it on the same line', () => {
    const r = extractInvoiceFields('Tax ID: 123-456-789 15/09/2024');
    expect(r.vendorTaxId).toMatchObject({ value: '123456789', country: 'EG' });
  });

  it('reads an invoice number after a spaced "No. :" label', () => {
    expect(extractInvoiceFields('Invoice No. : INV-77').invoiceNumber?.value).toBe('INV-77');
  });

  it('accepts a difference within the 0.01 tolerance', () => {
    const r = extractInvoiceFields(
      'Invoice No: A-1\nDate: 2024-01-20\nSub Total: 100.00\nVAT 15%: 15.00\nTotal: 115.01\n',
    );
    expect(r.warnings).toEqual([]);
  });

  it('flags an implausible VAT rate', () => {
    const r = extractInvoiceFields(
      'Invoice No: A-1\nDate: 2024-01-20\nSub Total: 100.00\nVAT: 40.00\nTotal: 140.00\n',
    );
    expect(r.warnings).toContain('VAT_RATE_IMPLAUSIBLE');
    expect(r.overallConfidence).toBeLessThan(0.6);
  });

  it('keeps missing totals null and never derives them', () => {
    const r = extractInvoiceFields(fixture('en-no-totals.txt'));
    expect(r.total).toBeNull();
    expect(r.subtotal).toBeNull();
    expect(r.tax).toBeNull();
    expect(r.date).toBeNull();
    expect(r.overallConfidence).toBeLessThan(0.6);
    const withoutTotal = extractInvoiceFields(
      'Sub Total: 100.00\nVAT 15%: 15.00\nDate: 2024-01-20',
    );
    expect(withoutTotal.total).toBeNull();
  });

  it('returns nothing for unrelated text', () => {
    const r = extractInvoiceFields('hello world\n12\nrandom words');
    expect(r.invoiceNumber).toBeNull();
    expect(r.vendorTaxId).toBeNull();
    expect(r.currency).toBeNull();
    expect(r.overallConfidence).toBe(0);
  });

  it('rejects a 10-digit number as a tax id and keeps currency null when ambiguous', () => {
    const r = extractInvoiceFields('VAT No: 1234567890\nSAR 10 AED 10');
    expect(r.vendorTaxId).toBeNull();
    expect(r.currency).toBeNull();
  });

  it('scales confidence down with a poor OCR text source', () => {
    const good = extractInvoiceFields(fixture('en-eg-invoice.txt'), 0.95);
    const poor = extractInvoiceFields(fixture('en-eg-invoice.txt'), 0.2);
    expect(poor.total?.confidence).toBeLessThan(good.total?.confidence ?? 0);
  });
});

describe('toExtractionResult', () => {
  it('maps rule output to the shared shape with evidence, nulls and 4-dp numbers', () => {
    const text = fixture('en-eg-invoice.txt');
    const result = toExtractionResult(extractInvoiceFields(text), text, 5);
    expect(result.total).toBe(1140);
    expect(result.lineItems).toEqual([]);
    expect(result.vendorAddress).toBeNull();
    expect(result.fieldEvidence?.total?.lineIndex).toBe(10);
    expect(result.fieldConfidence.total).toBeGreaterThan(0);
  });
});
