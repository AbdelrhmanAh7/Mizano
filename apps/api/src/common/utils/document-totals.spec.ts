import { BadRequestException } from '@nestjs/common';
import { computeDocumentTotals, computeLine } from './document-totals';

describe('document-totals', () => {
  it('2 × 100 at 14% => net 200, tax 28, gross 228', () => {
    const t = computeDocumentTotals([{ quantity: '2', rate: '100', taxRatePercent: '14' }]);
    expect(t.subtotal.toFixed(2)).toBe('200.00');
    expect(t.taxAmount.toFixed(2)).toBe('28.00');
    expect(t.grandTotal.toFixed(2)).toBe('228.00');
  });

  it('treats taxRatePercent as a percentage, never as an amount', () => {
    const t = computeDocumentTotals([{ quantity: '1', rate: '50', taxRatePercent: '14' }]);
    expect(t.taxAmount.toFixed(2)).toBe('7.00');
  });

  it('handles discounts, decimals and mixed tax rates exactly', () => {
    const t = computeDocumentTotals([
      { quantity: '3', rate: '33.33', taxRatePercent: '14', discountPercent: '10' },
      { quantity: '0.5', rate: '19.99', taxRatePercent: '0' },
      { quantity: '1', rate: '0.1', taxRatePercent: '5' },
    ]);
    // 3*33.33=99.99 → -10% = 89.991 → 89.99; tax 12.5986 → 12.60
    expect(t.lines[0].netAmount.toFixed(2)).toBe('89.99');
    expect(t.lines[0].taxAmount.toFixed(2)).toBe('12.60');
    // 0.5*19.99 = 9.995 → 10.00 (half-up)
    expect(t.lines[1].netAmount.toFixed(2)).toBe('10.00');
    // 0.1 * 5% = 0.005 → 0.01
    expect(t.lines[2].taxAmount.toFixed(2)).toBe('0.01');
    expect(t.subtotal.toFixed(2)).toBe('100.09');
    expect(t.taxAmount.toFixed(2)).toBe('12.61');
    expect(t.grandTotal.toFixed(2)).toBe('112.70');
  });

  it('adds shipping to the grand total', () => {
    const t = computeDocumentTotals([{ quantity: 1, rate: 10 }], { shipping: '5' });
    expect(t.grandTotal.toFixed(2)).toBe('15.00');
  });

  it('avoids float drift (0.1 + 0.2)', () => {
    const t = computeDocumentTotals([
      { quantity: '1', rate: '0.1' },
      { quantity: '1', rate: '0.2' },
    ]);
    expect(t.subtotal.toString()).toBe('0.3');
  });

  describe('EGP 2 dp rounding and VAT', () => {
    // Half-up, the documented rule (bankers' rounding would give 0.00, 1.00 and 0.12). Floats
    // get these wrong too: Math.round(1.005 * 100) / 100 is 1 and (2.675).toFixed(2) is '2.67'.
    it.each([
      ['0.005', '0.01'],
      ['1.005', '1.01'],
      ['2.675', '2.68'],
      ['0.125', '0.13'],
      ['1.004', '1.00'],
    ])('rounds a %s line half-up to %s', (rate, net) => {
      expect(computeLine({ quantity: '1', rate }).netAmount.toFixed(2)).toBe(net);
    });

    it('charges 14% VAT on 99.99 as 14.00, apart from the rate, with gross = net + VAT', () => {
      const t = computeDocumentTotals([{ quantity: '1', rate: '99.99', taxRatePercent: '14' }]);
      expect(t.subtotal.toFixed(2)).toBe('99.99');
      expect(t.taxAmount.toFixed(2)).toBe('14.00'); // 13.9986
      expect(t.grandTotal.toFixed(2)).toBe('113.99');
      expect(t.grandTotal.equals(t.subtotal.add(t.taxAmount))).toBe(true);
    });

    it('rounds per line, so the header equals the sum of the rounded lines', () => {
      const line = { quantity: '1', rate: '33.335', taxRatePercent: '14' };
      const t = computeDocumentTotals([line, line, line]);
      // Each line: net 33.34, VAT 4.6676 -> 4.67. Rounding the header would give 100.01 / 14.00.
      expect(t.lines.map((l) => l.netAmount.toFixed(2))).toEqual(['33.34', '33.34', '33.34']);
      expect(t.subtotal.toFixed(2)).toBe('100.02');
      expect(t.taxAmount.toFixed(2)).toBe('14.01');
      expect(t.grandTotal.toFixed(2)).toBe('114.03');
    });

    it('stays exact at 15 integer digits and for zero', () => {
      const big = computeLine({ quantity: '1000', rate: '123456789012.34', taxRatePercent: '14' });
      expect(big.netAmount.toFixed(2)).toBe('123456789012340.00');
      expect(big.taxAmount.toFixed(2)).toBe('17283950461727.60');
      const zero = computeLine({ quantity: '0', rate: '99.99', taxRatePercent: '14' });
      expect([zero.netAmount.toFixed(2), zero.taxAmount.toFixed(2)]).toEqual(['0.00', '0.00']);
    });

    it('rejects Arabic-Indic digits instead of misreading them', () => {
      expect(() => computeLine({ quantity: '١', rate: '١٠٠' })).toThrow(BadRequestException);
    });
  });

  it('rejects invalid input', () => {
    expect(() => computeLine({ quantity: 'abc', rate: '1' })).toThrow(BadRequestException);
    expect(() => computeLine({ quantity: '-1', rate: '1' })).toThrow(BadRequestException);
    expect(() => computeLine({ quantity: '1', rate: '1', taxRatePercent: '140' })).toThrow(
      BadRequestException,
    );
    expect(() => computeLine({ quantity: '1', rate: '1', discountPercent: '101' })).toThrow(
      BadRequestException,
    );
  });
});
