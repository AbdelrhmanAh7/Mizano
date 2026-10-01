import { buildVendorCreditPayload, checkCreditAmount } from './vendor-credit-payload';

describe('purchases vendor credit payload', () => {
  it('sends exactly the API DTO with a decimal-string amount', () => {
    expect(
      buildVendorCreditPayload({
        vendorId: 'v1',
        billId: 'b1',
        date: '2026-03-12',
        amount: ' 57.00 ',
        reason: '',
        accountId: '',
      }),
    ).toEqual({
      vendorId: 'v1',
      billId: 'b1',
      date: '2026-03-12',
      amount: '57.00',
      reason: undefined,
      accountId: undefined,
    });
  });

  it('flags invalid and over-bill amounts exactly', () => {
    expect(checkCreditAmount('', '114.00')).toBe('INVALID');
    expect(checkCreditAmount('0', '114.00')).toBe('INVALID');
    expect(checkCreditAmount('-1', '114.00')).toBe('INVALID');
    expect(checkCreditAmount('1.23456', '114.00')).toBe('INVALID');
    expect(checkCreditAmount('114.01', '114.00')).toBe('EXCEEDS_BILL');
    expect(checkCreditAmount('114.00', '114.00')).toBeNull();
    expect(checkCreditAmount('0.10', undefined)).toBeNull();
  });
});
