import { renderHook } from '@testing-library/react';
import { useCompactMoneyFormatter, useMoneyFormatter } from './use-money-formatter';

let mockLocale = 'en';
let mockBaseCurrency: string | undefined = 'EGP';
let mockDigits: 'latn' | 'arab' = 'latn';

jest.mock('next-intl', () => ({ useLocale: () => mockLocale }));
jest.mock('@/lib/hooks/use-organization', () => ({
  useMoneyFormat: () => ({
    data: mockBaseCurrency
      ? { baseCurrency: mockBaseCurrency, documentDigits: mockDigits }
      : undefined,
  }),
  documentCurrency: (code: string | null | undefined, base: string | undefined) => code || base,
}));

const format = () => renderHook(() => useMoneyFormatter()).result.current;
const compact = () => renderHook(() => useCompactMoneyFormatter()).result.current;

describe('useMoneyFormatter (PR #560 review)', () => {
  beforeEach(() => {
    mockLocale = 'en';
    mockBaseCurrency = 'EGP';
    mockDigits = 'latn';
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

describe('money display per organization (#83)', () => {
  beforeEach(() => {
    mockLocale = 'en';
    mockBaseCurrency = 'EGP';
    mockDigits = 'latn';
  });

  it.each(['EGP', 'SAR', 'AED'])('never shows $ or USD for a %s organization', (base) => {
    mockBaseCurrency = base;
    for (const locale of ['en', 'ar']) {
      mockLocale = locale;
      for (const text of [format()('1250.75'), format()('1250.75', null), compact()('1250000')]) {
        expect(text).not.toMatch(/\$|USD/);
      }
    }
  });

  it('uses Arabic-Indic digits on Arabic screens when the organization chose them', () => {
    mockLocale = 'ar';
    mockDigits = 'arab';
    expect(format()('1140.5')).toContain('١٬١٤٠٫٥٠');
    expect(format()('1140.5')).not.toMatch(/[0-9]/);
  });

  it('keeps Western digits in English whatever the organization chose', () => {
    mockDigits = 'arab';
    expect(format()('1140.5')).toContain('1,140.50');
  });
});
