/**
 * Build a Prisma date range filter object.
 *
 * Replaces the 15+ duplicate date-range filter blocks scattered across services:
 *   if (dateFrom) where.date = { ...where.date, gte: new Date(dateFrom) };
 *   if (dateTo)   where.date = { ...where.date, lte: new Date(dateTo) };
 *
 * Usage:
 *   const dateFilter = buildDateFilter(dateFrom, dateTo);
 *   // dateFilter = { gte: Date, lte: Date } or undefined
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
