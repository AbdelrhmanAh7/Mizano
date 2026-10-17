import { isValidCalendarDate } from './calendar-date';

describe('isValidCalendarDate', () => {
  it.each(['2026-09-01', '2024-02-29', '2026-10-01T00:00:00.000Z', ' 2026-09-01 '])(
    'accepts %s',
    (v) => expect(isValidCalendarDate(v)).toBe(true),
  );

  it.each([
    '2026-02-30',
    '2025-02-29',
    '2026-13-01',
    '2026-00-10',
    '09/01/2026',
    'Sep 1 2026',
    '2026-9-1',
    '',
    '2026-09-01Tgarbage',
  ])('rejects %s', (v) => expect(isValidCalendarDate(v)).toBe(false));

  it('rejects non-strings', () => {
    expect(isValidCalendarDate(undefined)).toBe(false);
    expect(isValidCalendarDate(20260901)).toBe(false);
  });
});
