import { formatCurrency, formatDate, formatNumber, formatPercent, cn } from './utils';

describe('cn (className utility)', () => {
  it('merges class names', () => {
    const result = cn('text-red-500', 'bg-blue-100');
    expect(result).toContain('text-red-500');
    expect(result).toContain('bg-blue-100');
  });

  it('handles conditional classes', () => {
    const result = cn('base', false && 'hidden', 'visible');
    expect(result).toContain('base');
    expect(result).toContain('visible');
    expect(result).not.toContain('hidden');
  });

  it('merges conflicting Tailwind classes (last wins)', () => {
    const result = cn('text-red-500', 'text-blue-500');
    expect(result).toBe('text-blue-500');
  });

  it('handles undefined and null inputs', () => {
    const result = cn('base', undefined, null, 'extra');
    expect(result).toContain('base');
    expect(result).toContain('extra');
  });
});

describe('formatCurrency', () => {
  it('formats an explicit USD amount with the default locale', () => {
    const result = formatCurrency(1234.56, 'USD');
    expect(result).toBe('$1,234.56');
  });

  it('formats EUR amount', () => {
    const result = formatCurrency(1234.56, 'EUR', 'en');
    // Intl may use narrow or standard euro symbol depending on environment
    expect(result).toContain('1,234.56');
  });

  it('formats zero amount', () => {
    const result = formatCurrency(0, 'USD');
    expect(result).toBe('$0.00');
  });

  it('formats negative amount', () => {
    const result = formatCurrency(-500.25, 'USD');
    expect(result).toContain('500.25');
    // Should contain a minus sign or be wrapped in parentheses
    expect(result).toMatch(/[-\u2212(]/);
  });

  it('formats large amounts with commas', () => {
    const result = formatCurrency(1000000, 'USD');
    expect(result).toBe('$1,000,000.00');
  });

  it('uses the provided locale for formatting', () => {
    const result = formatCurrency(1234.56, 'USD', 'de');
    // German locale uses period as thousands separator and comma as decimal
    expect(result).toContain('1.234,56');
  });
});

describe('formatDate', () => {
  it('formats a Date object with default options', () => {
    const date = new Date('2024-03-15T00:00:00Z');
    const result = formatDate(date);
    // Default format: short month, numeric day, numeric year
    expect(result).toContain('Mar');
    expect(result).toContain('15');
    expect(result).toContain('2024');
  });

  it('formats a date string', () => {
    const result = formatDate('2024-06-01');
    expect(result).toContain('Jun');
    expect(result).toContain('2024');
  });

  it('formats with custom options', () => {
    const result = formatDate('2024-12-25', 'en', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    expect(result).toContain('December');
    expect(result).toContain('25');
    expect(result).toContain('2024');
    expect(result).toContain('Wednesday');
  });

  it('formats date with Arabic locale', () => {
    const result = formatDate('2024-01-01', 'ar');
    // Arabic locale should produce Arabic output
    expect(result).toBeTruthy();
    expect(typeof result).toBe('string');
  });
});

describe('formatNumber', () => {
  it('formats an integer with thousands separator', () => {
    expect(formatNumber(1234567)).toBe('1,234,567');
  });

  it('formats zero', () => {
    expect(formatNumber(0)).toBe('0');
  });

  it('formats a decimal number', () => {
    const result = formatNumber(1234.567);
    expect(result).toContain('1,234');
  });

  it('formats negative numbers', () => {
    const result = formatNumber(-9876);
    expect(result).toContain('9,876');
    expect(result).toMatch(/[-\u2212]/);
  });

  it('uses the provided locale', () => {
    const result = formatNumber(1234567, 'de');
    // German uses period as thousands separator
    expect(result).toContain('1.234.567');
  });
});

describe('formatPercent', () => {
  it('formats a whole number percentage', () => {
    const result = formatPercent(50);
    expect(result).toBe('50%');
  });

  it('formats zero percent', () => {
    const result = formatPercent(0);
    expect(result).toBe('0%');
  });

  it('formats 100 percent', () => {
    const result = formatPercent(100);
    expect(result).toBe('100%');
  });

  it('formats a decimal percentage (up to 2 decimal places)', () => {
    const result = formatPercent(33.333);
    // minimumFractionDigits: 0, maximumFractionDigits: 2
    // The function divides by 100, so 33.333 -> 0.33333 -> "33.33%"
    expect(result).toBe('33.33%');
  });

  it('strips trailing zeros from decimal percentages', () => {
    const result = formatPercent(25);
    // 25/100 = 0.25 -> "25%" (minimumFractionDigits: 0 strips trailing zeros)
    expect(result).toBe('25%');
  });

  it('handles values greater than 100', () => {
    const result = formatPercent(150);
    expect(result).toBe('150%');
  });

  it('handles negative percentages', () => {
    const result = formatPercent(-10);
    expect(result).toMatch(/[-\u2212]10%/);
  });
});
