'use client';

import type { CursorPaginatedResponse } from '@/lib/types/table';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

interface UseInfiniteTableDataOptions<TData, TParams> {
  /** React Query cache key prefix, e.g. ['invoices'] */
  queryKey: string[];
  /** Function that fetches one page of cursor-based data */
  fetchFn: (
    params: TParams & { cursor?: string; take?: number },
  ) => Promise<CursorPaginatedResponse<TData>>;
  /** Query params from useTableParams (search, sortBy, sortOrder, filters, etc.) */
  params: TParams;
  /** Number of rows per batch (default 50) */
  take?: number;
  /** Whether the query is enabled (default true) */
  enabled?: boolean;
}

/**
 * Generic hook for infinite/cursor-based table data fetching.
 *
 * Wraps `useInfiniteQuery` from TanStack Query. Designed to work with
 * the DataTable component's `enableVirtualization` mode.
 *
 * Usage:
 * ```ts
 * const { data, total, hasNextPage, fetchNextPage, isFetchingNextPage, isLoading } =
 *   useInfiniteTableData({
 *     queryKey: ['invoices'],
 *     fetchFn: (params) => invoicesApi.getAllCursor(params).then(r => r.data),
 *     params: tableParams.queryParams,
 *   });
 * ```
 */
export function useInfiniteTableData<TData, TParams extends Record<string, unknown>>({
  queryKey,
  fetchFn,
  params,
  take = 50,
  enabled = true,
}: UseInfiniteTableDataOptions<TData, TParams>) {
  const query = useInfiniteQuery({
    queryKey: [...queryKey, 'infinite', params],
    queryFn: async ({ pageParam }) => {
      return fetchFn({
        ...params,
        cursor: pageParam as string | undefined,
        take,
      });
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => (lastPage.meta.hasMore ? lastPage.meta.nextCursor : undefined),
    enabled,
  });

  // Flatten all pages into a single data array
  const data = useMemo(
    () => query.data?.pages.flatMap((page) => page.data) ?? [],
    [query.data?.pages],
  );

  // Total comes from the first page only (subsequent pages return -1)
  const total = useMemo(() => {
    const firstPage = query.data?.pages[0];
    return firstPage?.meta.total ?? 0;
  }, [query.data?.pages]);

  return {
    data,
    total,
    hasNextPage: query.hasNextPage ?? false,
    fetchNextPage: query.fetchNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
    isFetching: query.isFetching,
  };
}
