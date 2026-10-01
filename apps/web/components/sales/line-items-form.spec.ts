jest.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
jest.mock('@/lib/hooks/use-items', () => ({ useActiveItems: () => ({ data: [] }) }));

import { calculateLineTotals, taxFieldsForPercent, toApiLines } from './line-items-form';

const taxRates = [
  { id: 'vat14', name: 'VAT 14%', rate: 14 },
  { id: 'vat5', name: 'VAT 5%', rate: 5 },
];

const baseLine = { description: 'Item', quantity: '1', rate: '100', amount: '100' };

describe('taxFieldsForPercent', () => {
  it('maps an item percent to the matching tax-rate option id', () => {
    expect(taxFieldsForPercent('14.00', taxRates)).toEqual({ taxRateId: 'vat14' });
  });

  it('keeps the percent when no option matches instead of dropping it', () => {
    expect(taxFieldsForPercent('7.5', taxRates)).toEqual({ taxRateId: '', taxPercent: '7.50' });
  });

  it('returns no tax for empty or zero percents', () => {
    expect(taxFieldsForPercent(null, taxRates)).toEqual({ taxRateId: '' });
    expect(taxFieldsForPercent('0', taxRates)).toEqual({ taxRateId: '' });
  });
});

describe('toApiLines', () => {
  it('submits the selected option percent', () => {
    const [line] = toApiLines([{ ...baseLine, taxRateId: 'vat5' }], taxRates);
    expect(line.taxRate).toBe('5.00');
  });

  it('submits the carried-over item percent when it has no option, never a silent 0.00', () => {
    const [line] = toApiLines([{ ...baseLine, taxRateId: '', taxPercent: '7.50' }], taxRates);
    expect(line.taxRate).toBe('7.50');
  });

  it('submits 0.00 only when the line really has no tax', () => {
    const [line] = toApiLines([{ ...baseLine }], taxRates);
    expect(line.taxRate).toBe('0.00');
  });
});

describe('calculateLineTotals', () => {
  const tenPercent = [{ id: 'vat10', name: 'VAT 10%', rate: 10 }];

  it('rounds tax per line like the server: two 0.05 lines at 10% give 0.02 tax, not 0.01', () => {
    const line = { ...baseLine, quantity: '1', rate: '0.05', amount: '0.05', taxRateId: 'vat10' };
    const totals = calculateLineTotals([line, line], tenPercent);
    expect(totals.subtotal).toBe(0.1);
    expect(totals.totalTax).toBe(0.02);
    expect(totals.grandTotal).toBe(0.12);
  });

  it('applies the discount before rounding the line net, once per line', () => {
    const line = {
      ...baseLine,
      quantity: '3',
      rate: '33.33',
      discountPercent: '10',
      taxRateId: 'vat10',
      amount: '89.99',
    };
    const totals = calculateLineTotals([line], tenPercent);
    // net = round(3 x 33.33 x 0.9) = 89.99; tax = round(8.999) = 9.00
    expect(totals.totalTax).toBe(9);
    expect(totals.grandTotal).toBe(98.99);
    expect(totals.totalDiscount).toBe(10);
  });

  it('uses the carried-over item percent when the line has no option', () => {
    const totals = calculateLineTotals([{ ...baseLine, taxPercent: '7.50' }], []);
    expect(totals.totalTax).toBe(7.5);
  });
});
