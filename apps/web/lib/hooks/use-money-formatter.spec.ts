import { renderHook } from '@testing-library/react';
import { useMoneyFormatter } from './use-money-formatter';

let mockLocale = 'en';
let mockBaseCurrency: string | undefined = 'EGP';

jest.mock('next-intl', () => ({ useLocale: () => mockLocale }));
jest.mock('@/lib/hooks/use-organization', () => ({
  useBaseCurrency: () => mockBaseCurrency,
  documentCurrency: (code: string | null | undefined, base: string | undefined) => code || base,
}));

const format = () => renderHook(() => useMoneyFormatter()).result.current;

describe('useMoneyFormatter (PR #560 review)', () => {
  beforeEach(() => {
    mockLocale = 'en';
    mockBaseCurrency = 'EGP';
  });

  it('uses the document currency, else the org base currency, never USD', () => {
    expect(format()('1140.5')).toBe(
      new Intl.NumberFormat('en', { style: 'currency', currency: 'EGP' }).format(1140.5),
    );
    expect(format()('10', 'SAR')).toContain('SAR');
    expect(format()('10', null)).not.toMatch(/\$|USD/);
  });

  it('keeps Western digits in Arabic and shows a plain number until the base currency loads', () => {
    mockLocale = 'ar';
    expect(format()('1140.5')).toContain('1,140.50');
    mockBaseCurrency = undefined;
    mockLocale = 'en';
    expect(format()('1140.5')).toBe('1,140.50');
    expect(format()('not a number')).toBe('0.00');
  });

  it('keeps two decimals in every currency and survives a code Intl does not know', () => {
    expect(format()('10.49', 'JPY')).toContain('10.49');
    expect(() => format()('5', 'US$')).not.toThrow();
    expect(format()('5', 'US$')).toBe('5.00 US$');
  });
});
