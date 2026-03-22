/** Options for cursor-based pagination. */
export interface CursorPaginateOptions {
  /** Opaque cursor (record ID) to resume from. Omit for the first page. */
  cursor?: string;
  /** Number of records per page (default 50). */
  take?: number;
  /** Prisma `include` clause for eager-loading relations. */
  include?: Record<string, unknown>;
  /** Prisma `select` clause for field projection. */
  select?: Record<string, unknown>;
}

/** Result shape returned by {@link cursorPaginate}. */
export interface CursorPaginatedResult<T> {
  data: T[];
  meta: {
    /** Total count of matching records. `-1` on subsequent pages (client caches the first-page total). */
    total: number;
    /** Cursor for the next page, or `null` if no more pages. */
    nextCursor: string | null;
    /** Whether additional pages exist beyond the current result set. */
    hasMore: boolean;
  };
}

/**
 * Generic cursor-based pagination utility for Prisma models.
 *
 * Uses Prisma's native cursor pagination with `cursor: { id }` + `skip: 1`.
 * Fetches `take + 1` to determine `hasMore` without an extra query.
 * `total` count is only fetched on the first request (when cursor is absent).
 *
 * @param model - Prisma model delegate (e.g. `prisma.invoice`). Must expose `findMany` and `count`.
 * @param where - Prisma where clause (should include `organizationId` for multi-tenancy).
 * @param orderBy - Prisma orderBy clause (e.g. `{ createdAt: 'desc' }`).
 * @param options - Cursor, take, include, and select options.
 * @returns Paginated result with `data`, `meta.total`, `meta.nextCursor`, and `meta.hasMore`.
 */
export async function cursorPaginate<T extends { id: string }>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  model: { findMany: (args: any) => Promise<T[]>; count: (args: any) => Promise<number> },
  where: Record<string, unknown>,
  orderBy: Record<string, string> | Record<string, string>[],
  options: CursorPaginateOptions = {},
): Promise<CursorPaginatedResult<T>> {
  const { cursor, take: rawTake = 50, include, select } = options;
  const take = typeof rawTake === 'string' ? parseInt(rawTake, 10) : rawTake;

  const findArgs: Record<string, unknown> = {
    where,
    orderBy,
    take: take + 1, // Fetch one extra to determine hasMore
  };

  if (cursor) {
    findArgs.cursor = { id: cursor };
    findArgs.skip = 1; // Skip the cursor item itself
  }

  if (include) findArgs.include = include;
  if (select) findArgs.select = select;

  // Fetch data and conditionally fetch total count (only on first page)
  const [rows, total] = await Promise.all([
    model.findMany(findArgs) as Promise<T[]>,
    cursor
      ? Promise.resolve(-1) // Skip count on subsequent pages
      : model.count({ where }),
  ]);

  const hasMore = rows.length > take;
  const data = hasMore ? rows.slice(0, take) : rows;
  const nextCursor = hasMore && data.length > 0 ? data[data.length - 1].id : null;

  return {
    data,
    meta: {
      total, // -1 on subsequent pages; client keeps the first-page total
      nextCursor,
      hasMore,
    },
  };
}
