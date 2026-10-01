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
