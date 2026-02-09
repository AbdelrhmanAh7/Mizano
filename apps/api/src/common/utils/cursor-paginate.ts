export interface CursorPaginateOptions {
  cursor?: string;
  take?: number;
  include?: Record<string, unknown>;
  select?: Record<string, unknown>;
}

export interface CursorPaginatedResult<T> {
  data: T[];
  meta: {
    total: number;
    nextCursor: string | null;
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
 * @param model - Prisma model delegate (e.g. prisma.invoice)
 * @param where - Prisma where clause
 * @param orderBy - Prisma orderBy clause
 * @param options - Cursor, take, include, select
 */
export async function cursorPaginate<T extends { id: string }>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  model: {
    findMany: (args: any) => Promise<T[]>;
    count: (args: any) => Promise<number>;
  },
  where: Record<string, unknown>,
  orderBy: Record<string, string> | Record<string, string>[],
  options: CursorPaginateOptions = {},
): Promise<CursorPaginatedResult<T>> {
  const { cursor, take = 50, include, select } = options;

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
