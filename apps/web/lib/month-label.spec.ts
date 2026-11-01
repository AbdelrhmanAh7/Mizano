import { formatMonthLabel } from './month-label';

describe('formatMonthLabel (TestSprite AIO-020: Arabic charts showed English months)', () => {
  it('writes the API month labels in Arabic', () => {
    expect(formatMonthLabel('Jan', 'ar')).toBe(
      new Intl.DateTimeFormat('ar', { month: 'short', timeZone: 'UTC' }).format(Date.UTC(2000, 0, 1)),
    );
    const withYear = formatMonthLabel('Nov 2026', 'ar');
    expect(withYear).toBe(
      new Intl.DateTimeFormat('ar', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(
        Date.UTC(2026, 10, 1),
      ),
    );
    expect(withYear).not.toContain('Nov');
  });

  it('leaves English and anything that is not a month label as it is', () => {
    expect(formatMonthLabel('Jan 2026', 'en')).toBe('Jan 2026');
    expect(formatMonthLabel('Q1', 'ar')).toBe('Q1');
    expect(formatMonthLabel('0-3K', 'ar')).toBe('0-3K');
    expect(formatMonthLabel(undefined, 'ar')).toBe('');
  });
});
