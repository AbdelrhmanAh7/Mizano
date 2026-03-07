/**
 * Build a Prisma date range filter object.
 *
 * Replaces the 15+ duplicate date-range filter blocks scattered across services:
 *   if (dateFrom) where.date = { ...where.date, gte: new Date(dateFrom) };
 *   if (dateTo)   where.date = { ...where.date, lte: new Date(dateTo) };
 *
 * @param from - Start date (inclusive). Accepts ISO string, Date, or null/undefined.
 * @param to - End date (inclusive). Accepts ISO string, Date, or null/undefined.
 * @returns A `{ gte?, lte? }` object for Prisma where clauses, or `undefined` if both params are absent.
 *
 * @example
 * ```ts
 * const where = { date: buildDateFilter(dto.dateFrom, dto.dateTo) };
 * ```
 */
export function buildDateFilter(
  from?: string | Date | null,
  to?: string | Date | null,
): { gte?: Date; lte?: Date } | undefined {
  if (!from && !to) return undefined;

  const filter: { gte?: Date; lte?: Date } = {};
  if (from) filter.gte = new Date(from);
  if (to) filter.lte = new Date(to);
  return filter;
}
