export type SortOrder = 'asc' | 'desc';

export interface TableParams {
  page: number;
  limit: number;
  search: string;
  sortBy: string;
  sortOrder: SortOrder;
}

export interface UseTableParamsOptions {
  defaultSortBy?: string;
  defaultSortOrder?: SortOrder;
  defaultLimit?: number;
  debounceMs?: number;
  /** Additional URL search param keys to track as filters. */
  filterKeys?: string[];
  /** When 'virtual', page is omitted from queryParams & limit defaults to 50 */
  mode?: 'paginated' | 'virtual';
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface CursorPaginatedResponse<T> {
  data: T[];
  meta: {
    total: number;
    nextCursor: string | null;
    hasMore: boolean;
  };
}

export interface CursorQueryParams {
  cursor?: string;
  take?: number;
  search?: string;
  sortBy?: string;
  sortOrder?: SortOrder;
  [key: string]: string | number | undefined;
}
