jest.mock('@/lib/hooks/use-items', () => ({ useActiveItems: () => ({ data: [] }) }));

import { taxFieldsForPercent, toApiLines } from './line-items-form';

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
