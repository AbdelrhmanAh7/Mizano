import {
  deriveExactTaxPercent,
  resolveScanLineTaxes,
  toDecimalString,
} from './document-intake-tax';

describe('document-intake-tax', () => {
  describe('deriveExactTaxPercent', () => {
    it.each([
      ['200', '28', '14'],
      ['100', '5', '5'],
      ['33.33', '0', '0'],
      ['80', '12', '15'],
      ['1000', '125', '12.5'],
      ['200.00', '28.00', '14'],
    ])('net %s, tax %s => %s%%', (net, tax, pct) => {
      expect(deriveExactTaxPercent(net, tax)).toBe(pct);
    });

    it.each([
      ['33.33', '4.67'], // 14.0114...% — rounded amount, not exact
      ['3', '1'], // 33.333...%
      ['0', '5'], // zero net
      ['10', '20'], // over 100%
      ['abc', '1'],
    ])('net %s, tax %s => unresolved', (net, tax) => {
      expect(deriveExactTaxPercent(net, tax)).toBeNull();
    });
  });

  describe('toDecimalString', () => {
    it('rejects exponents, negatives and non-finite numbers', () => {
      expect(toDecimalString(1e-7)).toBeNull();
      expect(toDecimalString(-1)).toBeNull();
      expect(toDecimalString(Number.NaN)).toBeNull();
      expect(toDecimalString(null)).toBeNull();
      expect(toDecimalString(100.5)).toBe('100.5');
    });
  });

  describe('resolveScanLineTaxes', () => {
    it('derives a percent from the line tax amount — never copies the amount', () => {
      const [line] = resolveScanLineTaxes([{ quantity: 2, unitPrice: 100, taxAmount: 28 }]);
      expect(line).toEqual({
        taxRatePercent: '14',
        unresolved: false,
        source: 'line',
        extractedTaxAmount: '28',
      });
    });

    it('leaves inexact amounts unresolved with the extracted amount for review', () => {
      const [line] = resolveScanLineTaxes([{ quantity: 1, unitPrice: 33.33, taxAmount: 4.67 }]);
      expect(line.unresolved).toBe(true);
      expect(line.taxRatePercent).toBe('');
      expect(line.extractedTaxAmount).toBe('4.67');
    });

    it('leaves missing or zero tax unresolved (not silently 0%)', () => {
      const lines = resolveScanLineTaxes([
        { quantity: 1, unitPrice: 10, taxAmount: null },
        { quantity: 1, unitPrice: 10, taxAmount: 0 },
      ]);
      expect(lines.every((l) => l.unresolved && l.taxRatePercent === '')).toBe(true);
    });

    it('uses an exact header rate only when no line has tax and nets match subtotal', () => {
      const lines = resolveScanLineTaxes(
        [
          { quantity: 2, unitPrice: 50, taxAmount: 0 },
          { quantity: 1, unitPrice: 100, taxAmount: 0 },
        ],
        { subtotal: 200, tax: 28 },
      );
      expect(lines.map((l) => [l.taxRatePercent, l.source])).toEqual([
        ['14', 'document'],
        ['14', 'document'],
      ]);
    });

    it('does not apply the header rate when nets do not reconcile to the subtotal', () => {
      const lines = resolveScanLineTaxes([{ quantity: 1, unitPrice: 150, taxAmount: 0 }], {
        subtotal: 200,
        tax: 28,
      });
      expect(lines[0].unresolved).toBe(true);
    });
  });
});
