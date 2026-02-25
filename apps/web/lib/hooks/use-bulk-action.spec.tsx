/**
 * Tests for useBulkAction hook.
 */

import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Mock useToast
const mockToast = jest.fn();
jest.mock('@/components/ui/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

import { useBulkAction } from './use-bulk-action';

// Helper: wrap with QueryClientProvider
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

beforeEach(() => {
  mockToast.mockClear();
});

describe('useBulkAction', () => {
  it('executes the mutation function with the provided IDs', async () => {
    const mutationFn = jest.fn().mockResolvedValue({ success: true });

    const { result } = renderHook(
      () =>
        useBulkAction({
          mutationFn,
          queryKeys: [['items']],
          successMessage: '{count} items deleted',
        }),
      { wrapper: createWrapper() },
    );

    await act(async () => {
      await result.current.execute(['id1', 'id2', 'id3']);
    });

    expect(mutationFn).toHaveBeenCalledWith(['id1', 'id2', 'id3']);
  });

  it('shows a success toast with the count replaced', async () => {
    const mutationFn = jest.fn().mockResolvedValue({ success: true });

    const { result } = renderHook(
      () =>
        useBulkAction({
          mutationFn,
          queryKeys: [['items']],
          successMessage: '{count} items deleted',
        }),
      { wrapper: createWrapper() },
    );

    await act(async () => {
      await result.current.execute(['id1', 'id2']);
    });

    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Success',
        description: '2 items deleted',
      }),
    );
  });

  it('shows an error toast when mutation fails', async () => {
    const mutationFn = jest.fn().mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(
      () =>
        useBulkAction({
          mutationFn,
          queryKeys: [['items']],
          errorMessage: 'Bulk action failed',
        }),
      { wrapper: createWrapper() },
    );

    await act(async () => {
      try {
        await result.current.execute(['id1']);
      } catch {
        // expected
      }
    });

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Error',
          variant: 'destructive',
        }),
      );
    });
  });

  it('calls onSuccess callback when mutation succeeds', async () => {
    const onSuccess = jest.fn();
    const mutationFn = jest.fn().mockResolvedValue({ count: 3 });

    const { result } = renderHook(
      () =>
        useBulkAction({
          mutationFn,
          queryKeys: [['items']],
          onSuccess,
        }),
      { wrapper: createWrapper() },
    );

    await act(async () => {
      await result.current.execute(['id1', 'id2', 'id3']);
    });

    expect(onSuccess).toHaveBeenCalledWith({ count: 3 });
  });

  it('tracks loading state', async () => {
    let resolve: (value: unknown) => void;
    const mutationFn = jest.fn().mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );

    const { result } = renderHook(
      () =>
        useBulkAction({
          mutationFn,
          queryKeys: [['items']],
        }),
      { wrapper: createWrapper() },
    );

    expect(result.current.isLoading).toBe(false);

    let executePromise: Promise<unknown>;
    act(() => {
      executePromise = result.current.execute(['id1']);
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(true);
    });

    await act(async () => {
      resolve!({ ok: true });
      await executePromise!;
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
  });
});
