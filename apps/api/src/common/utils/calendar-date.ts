const ISO_DATE_PREFIX = /^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/;

/**
 * True for `YYYY-MM-DD` (optionally followed by an ISO time) naming a real calendar day.
 * `new Date()` alone is lenient: it accepts "09/01/2026" and rolls 2026-02-30 into March.
 */
export function isValidCalendarDate(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const m = ISO_DATE_PREFIX.exec(value.trim());
  if (!m) return false;
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() + 1 !== month || d.getUTCDate() !== day) {
    return false;
  }
  return !Number.isNaN(new Date(value.trim()).getTime());
}
