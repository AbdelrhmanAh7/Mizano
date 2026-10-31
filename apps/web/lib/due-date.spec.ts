import { isPastDue } from './due-date';

describe('isPastDue', () => {
  // 14:30 local time on 31 Oct 2026
  const now = new Date(2026, 9, 31, 14, 30);

  it('is not overdue on the due date itself (stored at UTC midnight)', () => {
    expect(isPastDue('2026-10-31T00:00:00.000Z', now)).toBe(false);
  });

  it('is not overdue before the due date', () => {
    expect(isPastDue('2026-11-01T00:00:00.000Z', now)).toBe(false);
  });

  it('is overdue from the day after the due date', () => {
    expect(isPastDue('2026-10-30T00:00:00.000Z', now)).toBe(true);
    expect(isPastDue('2026-09-15', now)).toBe(true);
  });

  it('treats a missing due date as not overdue', () => {
    expect(isPastDue(null, now)).toBe(false);
  });
});
