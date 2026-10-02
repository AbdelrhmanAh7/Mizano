import { formatCurrency } from './use-reports';

jest.mock('@/lib/api', () => ({ __esModule: true, api: { get: jest.fn() } }));

describe('formatCurrency (reports)', () => {
  it('labels the amount with the given report currency', () => {
    const egp = formatCurrency('1234.5000', 'EGP');
    expect(egp).toContain('EGP');
    expect(egp).toContain('1,234.50');
    expect(formatCurrency(10, 'SAR')).toContain('SAR');
  });

  it('never falls back to dollars when the currency is unknown', () => {
    const plain = formatCurrency('1234.5', undefined);
    expect(plain).toBe('1,234.50');
    expect(formatCurrency(null, '')).toBe('0.00');
  });
});
