import { buildExpensePayload, previewExpense } from './expense-payload';

const base = {
  date: '2026-03-10',
  accountId: 'exp',
  amount: '100.00',
  taxRate: '14',
  taxInclusive: false,
  paidThroughAccountId: 'bank',
};

describe('purchases expense payload', () => {
  it('sends exactly the API DTO: decimal strings and no taxAmount', () => {
    const payload = buildExpensePayload({ ...base, vendorId: '', description: ' Rent ' });
    expect(payload).toEqual({
      date: '2026-03-10',
      accountId: 'exp',
      vendorId: undefined,
      amount: '100.00',
      taxRate: '14',
      taxInclusive: false,
      paidThroughAccountId: 'bank',
      description: 'Rent',
      reference: undefined,
      projectId: undefined,
    });
    expect(payload).not.toHaveProperty('taxAmount');
    expect(typeof payload.amount).toBe('string');
  });

  it('omits a zero tax rate', () => {
    expect(buildExpensePayload({ ...base, taxRate: '0' }).taxRate).toBeUndefined();
  });

  it('previews VAT-exclusive totals with half-up rounding to cents', () => {
    expect(previewExpense('100', '14', false)).toEqual({
      net: '100.00',
      tax: '14.00',
      total: '114.00',
    });
    // 0.10 * 14% = 0.014 -> 0.01 ; 0.50 * 14% = 0.07
    expect(previewExpense('0.10', '14', false)?.tax).toBe('0.01');
    expect(previewExpense('33.33', '14', false)?.tax).toBe('4.67'); // 4.6662
  });

  it('previews VAT-inclusive amounts as gross', () => {
    expect(previewExpense('114', '14', true)).toEqual({
      net: '100.00',
      tax: '14.00',
      total: '114.00',
    });
    expect(previewExpense('100', '14', true)?.tax).toBe('12.28'); // 100*14/114 = 12.2807
  });

  it('returns null for invalid input and treats a blank rate as zero', () => {
    expect(previewExpense('', '14', false)).toBeNull();
    expect(previewExpense('abc', '14', false)).toBeNull();
    expect(previewExpense('10', '', false)).toEqual({ net: '10.00', tax: '0.00', total: '10.00' });
  });
});
