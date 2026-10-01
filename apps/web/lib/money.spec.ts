import { computeTotals, toDecimalInput } from './money';

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
