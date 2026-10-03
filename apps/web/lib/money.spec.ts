import { computeTotals, findTotalsDiscrepancies, toDecimalInput } from './money';

describe('computeTotals (mirrors API document-totals)', () => {
  it('2 × 100 at 14% => net 200, tax 28, gross 228 (tax is a percent)', () => {
    const t = computeTotals([{ quantity: '2', rate: '100', taxRate: '14' }]);
    expect(t).toEqual({
      lines: [{ net: '200.00', tax: '28.00', total: '228.00' }],
      subtotal: '200.00',
      taxAmount: '28.00',
      grandTotal: '228.00',
    });
  });

  it('rounds per line half-up exactly like the server', () => {
    const t = computeTotals([
      { quantity: '0.5', rate: '19.99', taxRate: '0' }, // 9.995 -> 10.00
      { quantity: '1', rate: '0.1', taxRate: '5' }, // tax 0.005 -> 0.01
      { quantity: '1', rate: '0.1' },
      { quantity: '1', rate: '0.2' },
    ]);
    expect(t.lines[0].net).toBe('10.00');
    expect(t.lines[1].tax).toBe('0.01');
    expect(t.subtotal).toBe('10.40');
    expect(t.grandTotal).toBe('10.41');
  });

  it('treats empty or invalid input as zero', () => {
    expect(computeTotals([{ quantity: '', rate: 'abc', taxRate: null }]).grandTotal).toBe('0.00');
  });
});

describe('toDecimalInput', () => {
  it('keeps valid decimal strings and falls back otherwise', () => {
    expect(toDecimalInput(' 12.50 ')).toBe('12.50');
    expect(toDecimalInput('')).toBe('0');
    expect(toDecimalInput('1e3', '')).toBe('');
  });
});

describe('computeTotals parity with the API calculator', () => {
  // Same fixtures as apps/api document-intake.service.spec.ts "parity" cases; expected values are
  // what computeDocumentTotals returns (per-line half-up rounding).
  it('3-decimal quantity/rate with mixed taxes matches the server', () => {
    const t = computeTotals([
      { quantity: '3', rate: '33.33', taxRate: '14' }, // 99.99 + 14.00
      { quantity: '1.375', rate: '19.999', taxRate: '5' }, // 27.50 + 1.38
      { quantity: '7', rate: '0.35', taxRate: '0' }, // 2.45
    ]);
    expect(t.subtotal).toBe('129.94');
    expect(t.taxAmount).toBe('15.38');
    expect(t.grandTotal).toBe('145.32');
  });

  it('applies the line discount before tax', () => {
    const t = computeTotals([
      { quantity: '3', rate: '33.33', taxRate: '14', discountPercent: '12.5' },
    ]);
    expect(t.lines[0]).toEqual({ net: '87.49', tax: '12.25', total: '99.74' });
  });
});

describe('findTotalsDiscrepancies', () => {
  const computed = computeTotals([{ quantity: '2', rate: '100', taxRate: '14' }]);

  it('returns nothing when extracted totals agree within 0.01', () => {
    expect(findTotalsDiscrepancies(computed, { subtotal: 200, tax: 28.01, total: 228 })).toEqual(
      [],
    );
  });

  it('flags every field that differs by more than 0.01 and keeps computed values', () => {
    expect(findTotalsDiscrepancies(computed, { subtotal: 200, tax: 14, total: 214 })).toEqual([
      { field: 'tax', extracted: '14', computed: '28.00' },
      { field: 'total', extracted: '214', computed: '228.00' },
    ]);
  });

  it.each(['28.01001', '27.98999'])('preserves full precision beyond the tolerance: %s', (tax) => {
    expect(findTotalsDiscrepancies(computed, { tax })).toEqual([
      { field: 'tax', extracted: tax, computed: '28.00' },
    ]);
  });

  it.each(['28.01000', '27.99000', '28.00999'])(
    'accepts values at or within tolerance: %s',
    (tax) => {
      expect(findTotalsDiscrepancies(computed, { tax })).toEqual([]);
    },
  );

  it('does not flag missing extracted values', () => {
    expect(
      findTotalsDiscrepancies(computed, { subtotal: null, tax: undefined, total: null }),
    ).toEqual([]);
  });
});
