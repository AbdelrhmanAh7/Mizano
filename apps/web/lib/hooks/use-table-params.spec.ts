/**
 * Tests for useTableParams hook.
 *
 * Since the hook uses Next.js navigation (useSearchParams, useRouter, usePathname),
 * we mock them and verify that the hook correctly reads/writes URL search params.
 */

import { act, renderHook } from '@testing-library/react';

// -- Mocks ---------------------------------------------------------------

let mockSearchParams = new URLSearchParams();
const mockReplace = jest.fn();
const mockPathname = '/test';

jest.mock('next/navigation', () => ({
  useSearchParams: () => mockSearchParams,
  useRouter: () => ({ replace: mockReplace }),
  usePathname: () => mockPathname,
}));

// Mock useDebouncedCallback to fire immediately
jest.mock('@/lib/hooks/use-debounce', () => ({
  useDebouncedCallback: (fn: (...args: unknown[]) => void) => fn,
}));

// Minimal React.useTransition mock (execute inline)
const originalReact = jest.requireActual('react');
jest.spyOn(originalReact, 'useTransition').mockReturnValue([false, (fn: () => void) => fn()]);

import { useTableParams } from './use-table-params';

// -- Tests ----------------------------------------------------------------

beforeEach(() => {
  mockSearchParams = new URLSearchParams();
  mockReplace.mockClear();
});

describe('useTableParams', () => {
  it('returns default values when no search params', () => {
    const { result } = renderHook(() => useTableParams());
    expect(result.current.page).toBe(1);
    expect(result.current.limit).toBe(20);
    expect(result.current.search).toBe('');
    expect(result.current.sortBy).toBe('createdAt');
    expect(result.current.sortOrder).toBe('desc');
    expect(result.current.filters).toEqual({});
    expect(result.current.activeFilterCount).toBe(0);
  });

  it('reads values from search params', () => {
    mockSearchParams = new URLSearchParams(
      'page=3&limit=50&search=hello&sortBy=name&sortOrder=asc',
    );
    const { result } = renderHook(() => useTableParams());
    expect(result.current.page).toBe(3);
    expect(result.current.limit).toBe(50);
    expect(result.current.search).toBe('hello');
    expect(result.current.sortBy).toBe('name');
    expect(result.current.sortOrder).toBe('asc');
  });

  it('uses custom defaults', () => {
    const { result } = renderHook(() =>
      useTableParams({ defaultSortBy: 'date', defaultSortOrder: 'asc', defaultLimit: 10 }),
    );
    expect(result.current.sortBy).toBe('date');
    expect(result.current.sortOrder).toBe('asc');
    expect(result.current.limit).toBe(10);
  });

  it('setPage calls router.replace with page param', () => {
    const { result } = renderHook(() => useTableParams());
    act(() => result.current.setPage(5));
    expect(mockReplace).toHaveBeenCalledWith(
      expect.stringContaining('page=5'),
      expect.objectContaining({ scroll: false }),
    );
  });

  it('setPage(1) removes page param (default)', () => {
    mockSearchParams = new URLSearchParams('page=5');
    const { result } = renderHook(() => useTableParams());
    act(() => result.current.setPage(1));
    expect(mockReplace).toHaveBeenCalledWith(
      mockPathname,
      expect.objectContaining({ scroll: false }),
    );
  });

  it('setSearch triggers a navigation with search param', () => {
    const { result } = renderHook(() => useTableParams());
    act(() => result.current.setSearch('invoice'));
    expect(mockReplace).toHaveBeenCalledWith(
      expect.stringContaining('search=invoice'),
      expect.objectContaining({ scroll: false }),
    );
  });

  it('setSort toggles asc/desc', () => {
    const { result } = renderHook(() =>
      useTableParams({ defaultSortBy: 'date', defaultSortOrder: 'desc' }),
    );
    // Current is desc, toggling date should go to asc
    act(() => result.current.setSort('date'));
    expect(mockReplace).toHaveBeenCalledWith(
      expect.stringContaining('sortOrder=asc'),
      expect.objectContaining({ scroll: false }),
    );
  });

  it('setLimit resets to page 1', () => {
    mockSearchParams = new URLSearchParams('page=3');
    const { result } = renderHook(() => useTableParams());
    act(() => result.current.setLimit(50));
    const call = mockReplace.mock.calls[0][0] as string;
    expect(call).toContain('limit=50');
    expect(call).not.toContain('page=');
  });

  it('setFilter sets a filter key and resets page', () => {
    const { result } = renderHook(() => useTableParams({ filterKeys: ['status'] }));
    act(() => result.current.setFilter('status', 'PAID'));
    expect(mockReplace).toHaveBeenCalledWith(
      expect.stringContaining('status=PAID'),
      expect.objectContaining({ scroll: false }),
    );
  });

  it('setFilter with undefined clears the filter', () => {
    mockSearchParams = new URLSearchParams('status=PAID');
    const { result } = renderHook(() => useTableParams({ filterKeys: ['status'] }));
    act(() => result.current.setFilter('status', undefined));
    const call = mockReplace.mock.calls[0][0] as string;
    expect(call).not.toContain('status');
  });

  it('setFilters sets multiple filter keys at once', () => {
    const { result } = renderHook(() => useTableParams({ filterKeys: ['dateFrom', 'dateTo'] }));
    act(() => result.current.setFilters({ dateFrom: '2024-01-01', dateTo: '2024-12-31' }));
    const call = mockReplace.mock.calls[0][0] as string;
    expect(call).toContain('dateFrom=2024-01-01');
    expect(call).toContain('dateTo=2024-12-31');
  });

  it('filters are available in queryParams', () => {
    mockSearchParams = new URLSearchParams('status=DRAFT&dateFrom=2024-01-01');
    const { result } = renderHook(() => useTableParams({ filterKeys: ['status', 'dateFrom'] }));
    expect(result.current.filters).toEqual({ status: 'DRAFT', dateFrom: '2024-01-01' });
    expect(result.current.queryParams).toMatchObject({ status: 'DRAFT', dateFrom: '2024-01-01' });
    expect(result.current.activeFilterCount).toBe(2);
  });

  it('resetParams clears all params', () => {
    mockSearchParams = new URLSearchParams('status=PAID&page=3&search=hello');
    const { result } = renderHook(() => useTableParams({ filterKeys: ['status'] }));
    act(() => result.current.resetParams());
    expect(mockReplace).toHaveBeenCalledWith(
      mockPathname,
      expect.objectContaining({ scroll: false }),
    );
  });
});
