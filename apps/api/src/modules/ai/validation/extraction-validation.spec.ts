import {
  validateAmount,
  validateCurrency,
  validateDate,
  validateExtraction,
  validateInvoiceNumber,
  validateTaxId,
  ValidationInput,
} from './extraction-validation';

const NOW = new Date('2026-10-03T10:00:00Z');
const GOOD: ValidationInput = {
  invoiceNumber: 'INV-1001',
  date: '2026-09-01',
  currency: 'SAR',
  subtotal: 100,
  tax: 15,
  total: 115,
  vendorTaxId: '300000000000003',
};
const ctx = { baseCurrency: 'SAR', vendorMatchedByTaxId: false, now: NOW };

describe('validateInvoiceNumber', () => {
  it('accepts normal numbers and flags empty or symbol-only', () => {
    expect(validateInvoiceNumber('INV-2026/01').status).toBe('valid');
    expect(validateInvoiceNumber('  ')).toMatchObject({ status: 'missing' });
    expect(validateInvoiceNumber('---')).toMatchObject({
      status: 'invalid',
      reasons: ['INVOICE_NUMBER_FORMAT'],
    });
  });
});

describe('validateDate', () => {
  it('validates, rejects bad/old/future and keeps ambiguity as a warning', () => {
    expect(validateDate('2026-09-01', false, NOW).status).toBe('valid');
    expect(validateDate('2026-02-30', false, NOW).reasons).toEqual(['DATE_INVALID']);
    expect(validateDate('1999-12-31', false, NOW).reasons).toEqual(['DATE_TOO_OLD']);
    expect(validateDate('2026-10-10', false, NOW).status).toBe('valid');
    expect(validateDate('2026-10-11', false, NOW).reasons).toEqual(['DATE_IN_FUTURE']);
    expect(validateDate(null, false, NOW).status).toBe('missing');
    expect(validateDate('2026-03-04', true, NOW)).toMatchObject({
      status: 'warning',
      reasons: ['DATE_AMBIGUOUS'],
    });
  });
});

describe('validateCurrency', () => {
  it('must equal the base currency', () => {
    expect(validateCurrency('sar', 'SAR').status).toBe('valid');
    expect(validateCurrency('EGP', 'SAR')).toMatchObject({
      status: 'invalid',
      reasons: ['CURRENCY_NOT_BASE'],
    });
    expect(validateCurrency(null, 'SAR').status).toBe('missing');
  });
});

describe('validateAmount', () => {
  it('bounds to Decimal(19,4) and rejects negatives', () => {
    expect(validateAmount(10.5)).toMatchObject({ status: 'valid', value: '10.5000' });
    expect(validateAmount(null).status).toBe('missing');
    expect(validateAmount(-1).reasons).toEqual(['AMOUNT_NEGATIVE']);
    expect(validateAmount(1e15).reasons).toEqual(['AMOUNT_OUT_OF_RANGE']);
    expect(validateAmount(Number.NaN).reasons).toEqual(['AMOUNT_NOT_NUMERIC']);
    expect(validateAmount(1.123456)).toMatchObject({ status: 'warning' });
  });
});

describe('validateTaxId', () => {
  it('EG needs 9 digits', () => {
    expect(validateTaxId('123-456-789', 'EG').status).toBe('valid');
    expect(validateTaxId('12345678', 'EG').reasons).toEqual(['TAX_ID_FORMAT']);
  });
  it('SA needs 15 digits starting and ending with 3', () => {
    expect(validateTaxId('300000000000003', 'SA').status).toBe('valid');
    expect(validateTaxId('100000000000003', 'SA').status).toBe('invalid');
    expect(validateTaxId('300000000000001', 'SA').status).toBe('invalid');
  });
  it('AE TRN needs 15 digits, Arabic digits are normalized', () => {
    expect(validateTaxId('100123456700003', 'AE').status).toBe('valid');
    expect(validateTaxId('١٠٠١٢٣٤٥٦٧٠٠٠٠٣', 'AE').status).toBe('valid');
    expect(validateTaxId('10012345670000', 'AE').status).toBe('invalid');
    expect(validateTaxId('TRN100123456700003', 'AE').status).toBe('invalid');
  });
  it('without a country hint any country format is accepted; empty is missing', () => {
    expect(validateTaxId('123456789', null).status).toBe('valid');
    expect(validateTaxId('', null).status).toBe('missing');
  });
});

describe('validateExtraction', () => {
  it('passes a consistent SA invoice', () => {
    const v = validateExtraction(GOOD, ctx);
    expect(v.requiresReview).toBe(false);
    expect(v.blockingFields).toEqual([]);
    expect(v.fields.vendor).toMatchObject({ status: 'warning', reasons: ['VENDOR_NOT_MATCHED'] });
  });

  it('reports a vendor match by tax id', () => {
    const v = validateExtraction(GOOD, { ...ctx, vendorMatchedByTaxId: true });
    expect(v.fields.vendor).toMatchObject({
      status: 'valid',
      reasons: ['VENDOR_MATCHED_BY_TAX_ID'],
    });
  });

  it('flags a totals mismatch on subtotal, tax and total', () => {
    const v = validateExtraction({ ...GOOD, total: 120 }, ctx);
    expect(v.fields.total.reasons).toContain('TOTALS_MISMATCH');
    expect(v.fields.subtotal.status).toBe('invalid');
    expect(v.blockingFields).toEqual(expect.arrayContaining(['subtotal', 'tax', 'total']));
    expect(v.requiresReview).toBe(true);
  });

  it('tolerates a 0.01 rounding difference', () => {
    expect(validateExtraction({ ...GOOD, total: 115.01 }, ctx).requiresReview).toBe(false);
  });

  it('warns on an unexpected VAT rate per country', () => {
    const sa = validateExtraction({ ...GOOD, subtotal: 100, tax: 14, total: 114 }, ctx);
    expect(sa.fields.tax).toMatchObject({ status: 'warning', reasons: ['VAT_RATE_UNEXPECTED'] });
    expect(sa.requiresReview).toBe(false);
    const eg = validateExtraction(
      { ...GOOD, currency: 'EGP', tax: 14, total: 114, vendorTaxId: '123456789' },
      { ...ctx, baseCurrency: 'EGP' },
    );
    expect(eg.fields.tax.status).toBe('valid');
    const ae = validateExtraction(
      { ...GOOD, currency: 'AED', tax: 5, total: 105, vendorTaxId: '100123456700003' },
      { ...ctx, baseCurrency: 'AED' },
    );
    expect(ae.fields.tax.status).toBe('valid');
    expect(
      validateExtraction(
        { ...GOOD, currency: 'AED', vendorTaxId: '100123456700003' },
        { ...ctx, baseCurrency: 'AED' },
      ).fields.tax.status,
    ).toBe('warning');
  });

  it('routes an invalid tax id and a foreign currency to review', () => {
    expect(validateExtraction({ ...GOOD, vendorTaxId: '123' }, ctx).blockingFields).toEqual([
      'vendorTaxId',
    ]);
    const v = validateExtraction({ ...GOOD, currency: 'EGP', vendorTaxId: '123456789' }, ctx);
    expect(v.blockingFields).toContain('currency');
  });

  it('requires date, total and currency but not the invoice number', () => {
    const v = validateExtraction(
      { ...GOOD, invoiceNumber: null, date: null, total: null, currency: null, tax: null },
      ctx,
    );
    expect(v.blockingFields).toEqual(['date', 'currency', 'total']);
    const noNumber = validateExtraction({ ...GOOD, invoiceNumber: null }, ctx);
    expect(noNumber.requiresReview).toBe(false);
  });

  it('keeps DATE_AMBIGUOUS as a non-blocking warning and carries evidence', () => {
    const evidence = { text: 'Date: 03/04/2026', lineIndex: 2 };
    const v = validateExtraction(
      { ...GOOD, extractionWarnings: ['DATE_AMBIGUOUS'], fieldEvidence: { date: evidence } },
      ctx,
    );
    expect(v.fields.date).toMatchObject({ status: 'warning', evidence });
    expect(v.requiresReview).toBe(false);
  });
});
