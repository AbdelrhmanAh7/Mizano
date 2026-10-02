import { DocumentIntakeResult } from '../services/document-intake.service';
import { billResult } from './intake-test-utils';
import { buildBillConfirmation } from './intake-bulk-approve';

describe('buildBillConfirmation', () => {
  it('builds an exact decimal confirm payload from a complete extraction', () => {
    const c = buildBillConfirmation(billResult());
    expect(c).toEqual({
      ok: true,
      input: {
        type: 'BILL',
        vendorId: 'v1',
        date: '2026-09-01',
        dueDate: '2026-09-01',
        reference: 'INV-9',
        currencyCode: 'EGP',
        lines: [{ description: 'CPU', quantity: '1', rate: '100', taxRatePercent: '15' }],
      },
    });
  });

  it.each([
    ['NOT_BILL', { documentType: 'INVOICE' }],
    ['NO_VENDOR', { matchedVendor: null }],
  ])('blocks %s', (code, override) => {
    const c = buildBillConfirmation(billResult(override as Partial<DocumentIntakeResult>));
    expect(c).toMatchObject({ ok: false, code });
  });

  it('blocks missing total, date and lines', () => {
    const base = billResult();
    const f = base.extractedFields;
    expect(
      buildBillConfirmation({ ...base, extractedFields: { ...f, total: null } }),
    ).toMatchObject({ code: 'NO_TOTAL' });
    expect(buildBillConfirmation({ ...base, extractedFields: { ...f, date: null } })).toMatchObject(
      { code: 'NO_DATE' },
    );
    expect(
      buildBillConfirmation({ ...base, extractedFields: { ...f, lineItems: [] } }),
    ).toMatchObject({ code: 'NO_LINES' });
  });

  it('never turns a missing tax into 0 percent', () => {
    const base = billResult();
    const f = base.extractedFields;
    const items = [{ description: 'CPU', quantity: 1, unitPrice: 100, taxAmount: 0, total: 100 }];
    expect(
      buildBillConfirmation({
        ...base,
        extractedFields: { ...f, lineItems: items, tax: null, subtotal: null, total: 100 },
      }),
    ).toMatchObject({ ok: false, code: 'TAX_UNRESOLVED' });
  });

  it('uses an exact header rate when no line carries tax and nets match the subtotal', () => {
    const base = billResult();
    const f = base.extractedFields;
    const items = [{ description: 'CPU', quantity: 2, unitPrice: 50, taxAmount: 0, total: 100 }];
    const c = buildBillConfirmation({ ...base, extractedFields: { ...f, lineItems: items } });
    expect(c).toMatchObject({ ok: true });
    if (c.ok) expect(c.input.lines[0].taxRatePercent).toBe('15');
  });

  it('blocks totals that do not reconcile', () => {
    const base = billResult();
    const c = buildBillConfirmation({
      ...base,
      extractedFields: { ...base.extractedFields, total: 120 },
    });
    expect(c).toMatchObject({ ok: false, code: 'TOTAL_MISMATCH' });
  });

  it('blocks a document in another currency and normalizes the base currency code', () => {
    const base = billResult();
    expect(buildBillConfirmation(base, { baseCurrency: 'usd' })).toMatchObject({
      ok: false,
      code: 'CURRENCY_MISMATCH',
    });
    expect(buildBillConfirmation(base, { baseCurrency: ' egp ' })).toMatchObject({ ok: true });
    // No base currency known (or none extracted): nothing to compare, the draft is still built.
    expect(buildBillConfirmation(base)).toMatchObject({ ok: true });
    const noCurrency = { ...base, extractedFields: { ...base.extractedFields, currency: null } };
    const c = buildBillConfirmation(noCurrency, { baseCurrency: 'USD' });
    expect(c).toMatchObject({ ok: true });
    if (c.ok) expect(c.input.currencyCode).toBeUndefined();
  });

  it('bounds quantities and rates like the confirm DTO (no exponent, 15.6 digits)', () => {
    const base = billResult();
    const f = base.extractedFields;
    const tooWide = [
      { description: 'CPU', quantity: 1e16, unitPrice: 1, taxAmount: 0, total: 1e16 },
    ];
    expect(
      buildBillConfirmation({ ...base, extractedFields: { ...f, lineItems: tooWide } }),
    ).toMatchObject({ ok: false, code: 'INVALID_LINE' });
    const tooFine = [
      { description: 'CPU', quantity: 0.0000001, unitPrice: 100, taxAmount: 0, total: 0 },
    ];
    expect(
      buildBillConfirmation({ ...base, extractedFields: { ...f, lineItems: tooFine } }),
    ).toMatchObject({ ok: false, code: 'INVALID_LINE' });
  });

  it('reconciles with the shared calculator (per-line rounding) within one minor unit', () => {
    const base = billResult();
    const f = base.extractedFields;
    // 3 x 33.33 = 99.99 net; 14% per line = 4.67 x 3 = 14.01 (server), vendor printed 14.00.
    const items = [
      { description: 'A', quantity: 1, unitPrice: 33.33, taxAmount: 4.6662, total: 37.9962 },
      { description: 'B', quantity: 1, unitPrice: 33.33, taxAmount: 4.6662, total: 37.9962 },
      { description: 'C', quantity: 1, unitPrice: 33.33, taxAmount: 4.6662, total: 37.9962 },
    ];
    const c = buildBillConfirmation({
      ...base,
      extractedFields: { ...f, lineItems: items, subtotal: 99.99, tax: 14, total: 113.99 },
    });
    expect(c).toMatchObject({ ok: true });
    if (c.ok) expect(c.input.lines.map((l) => l.taxRatePercent)).toEqual(['14', '14', '14']);
    expect(
      buildBillConfirmation({
        ...base,
        extractedFields: { ...f, lineItems: items, subtotal: 99.99, tax: 14, total: 113.97 },
      }),
    ).toMatchObject({ ok: false, code: 'TOTAL_MISMATCH' });
  });
});
