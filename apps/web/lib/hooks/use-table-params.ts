'use client';

import { useDebouncedCallback } from '@/lib/hooks/use-debounce';
import type { SortOrder, TableParams, UseTableParamsOptions } from '@/lib/types/table';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo, useTransition } from 'react';

export function useTableParams(options: UseTableParamsOptions = {}) {
  const {
    defaultSortBy = 'createdAt',
    defaultSortOrder = 'desc',
    defaultLimit = options.mode === 'virtual' ? 50 : 20,
    debounceMs = 300,
    filterKeys = [],
    mode = 'paginated',
  } = options;

  const isVirtual = mode === 'virtual';

  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  const params: TableParams = useMemo(
    () => ({
      page: Number(searchParams.get('page')) || 1,
      limit: Number(searchParams.get('limit')) || defaultLimit,
      search: searchParams.get('search') || '',
      sortBy: searchParams.get('sortBy') || defaultSortBy,
      sortOrder: (searchParams.get('sortOrder') as SortOrder) || defaultSortOrder,
    }),
    [searchParams, defaultSortBy, defaultSortOrder, defaultLimit],
  );

  /** Parse additional filter values from search params. */
  const filters: Record<string, string> = useMemo(() => {
    const result: Record<string, string> = {};
    for (const key of filterKeys) {
      const val = searchParams.get(key);
      if (val) result[key] = val;
    }
    return result;
  }, [searchParams, filterKeys]);

  const updateParams = useCallback(
    (updates: Record<string, string | number | undefined | null>) => {
      startTransition(() => {
        const newParams = new URLSearchParams(searchParams.toString());

        Object.entries(updates).forEach(([key, value]) => {
          if (
            value === undefined ||
            value === null ||
            value === '' ||
            (key === 'page' && value === 1) ||
            (key === 'limit' && value === defaultLimit) ||
            (key === 'sortBy' && value === defaultSortBy) ||
            (key === 'sortOrder' && value === defaultSortOrder)
          ) {
            newParams.delete(key);
          } else {
            newParams.set(key, String(value));
          }
        });

        const qs = newParams.toString();
        router.replace(`${pathname}${qs ? `?${qs}` : ''}`, { scroll: false });
      });
    },
    [searchParams, router, pathname, defaultSortBy, defaultSortOrder, defaultLimit],
  );

  const setPage = useCallback((page: number) => updateParams({ page }), [updateParams]);

  const setSearch = useDebouncedCallback((search: string) => {
    updateParams({ search, page: 1 });
  }, debounceMs);

  const setSort = useCallback(
    (sortBy: string) => {
      const newOrder: SortOrder =
        params.sortBy === sortBy && params.sortOrder === 'asc' ? 'desc' : 'asc';
      updateParams({ sortBy, sortOrder: newOrder, page: 1 });
    },
    [params.sortBy, params.sortOrder, updateParams],
  );

  const setLimit = useCallback((limit: number) => updateParams({ limit, page: 1 }), [updateParams]);

  /** Set an arbitrary filter value. Resets to page 1. */
  const setFilter = useCallback(
    (key: string, value: string | undefined) => {
      updateParams({ [key]: value, page: 1 });
    },
    [updateParams],
  );

  /** Set multiple filter values at once. Resets to page 1. */
  const setFilters = useCallback(
    (updates: Record<string, string | undefined>) => {
      updateParams({ ...updates, page: 1 });
    },
    [updateParams],
  );

  const resetParams = useCallback(() => {
    startTransition(() => {
      router.replace(pathname, { scroll: false });
    });
  }, [router, pathname]);

  /** Number of active filters (non-core params from filterKeys). */
  const activeFilterCount = useMemo(() => Object.keys(filters).length, [filters]);

  const queryParams = useMemo(
    () => ({
      ...(isVirtual ? {} : { page: params.page }),
      ...(isVirtual ? { take: params.limit } : { limit: params.limit }),
      search: params.search || undefined,
      sortBy: params.sortBy,
      sortOrder: params.sortOrder,
      ...filters,
    }),
    [params, filters, isVirtual],
  );

  return {
    ...params,
    filters,
    setPage,
    setSearch,
    setSort,
    setLimit,
    setFilter,
    setFilters,
    resetParams,
    queryParams,
    activeFilterCount,
    isPending,
    isVirtual,
  };
}
