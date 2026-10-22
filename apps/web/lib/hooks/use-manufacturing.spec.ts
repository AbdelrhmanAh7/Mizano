/**
 * Unit tests covering AC1-AC5 for useCompleteWorkOrder hook (@issue-355).
 * Validates quantity resolution, explicit zero handling, and error rejection.
 */
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// ── Mocks ──────────────────────────────────────────────────────

jest.mock('@/lib/api', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
  },
}));

jest.mock('@/components/ui/use-toast', () => ({
  useToast: () => ({ toast: jest.fn() }),
}));

// ── Imports after mocks ────────────────────────────────────────

import api from '@/lib/api';
import { useCompleteWorkOrder } from './use-manufacturing';

const mockApiPost = api.post as jest.Mock;

// ── Helpers ────────────────────────────────────────────────────

const createWrapper = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
  Wrapper.displayName = 'TestWrapper';
  return Wrapper;
};

// ── Tests ──────────────────────────────────────────────────────

describe('useCompleteWorkOrder (@issue-355)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockApiPost.mockResolvedValue({ data: { id: 'wo-123', status: 'COMPLETED' } });
  });

  it('AC1: rejects completion when both quantityProduced and producedQuantity are absent', async () => {
    const { result } = renderHook(() => useCompleteWorkOrder(), { wrapper: createWrapper() });

    await expect(
      act(async () => {
        await result.current.mutateAsync({ id: 'wo-123' } as unknown as {
          id: string;
          quantityProduced: number;
        });
      }),
    ).rejects.toThrow('A completion quantity is required');

    expect(mockApiPost).not.toHaveBeenCalled();
  });

  it('AC1: rejects completion when quantity is NaN', async () => {
    const { result } = renderHook(() => useCompleteWorkOrder(), { wrapper: createWrapper() });

    await expect(
      act(async () => {
        await result.current.mutateAsync({ id: 'wo-123', quantityProduced: Number.NaN });
      }),
    ).rejects.toThrow('A completion quantity is required');

    expect(mockApiPost).not.toHaveBeenCalled();
  });

  it('AC2: calls api.post with quantityProduced when quantityProduced is provided', async () => {
    const { result } = renderHook(() => useCompleteWorkOrder(), { wrapper: createWrapper() });

    await act(async () => {
      await result.current.mutateAsync({ id: 'wo-123', quantityProduced: 5 });
    });

    expect(mockApiPost).toHaveBeenCalledWith('/manufacturing/work-orders/wo-123/complete', {
      quantityProduced: 5,
    });
    expect(mockApiPost).toHaveBeenCalledTimes(1);
  });

  it('AC2: allows boundary zero quantity when explicitly provided via quantityProduced', async () => {
    const { result } = renderHook(() => useCompleteWorkOrder(), { wrapper: createWrapper() });

    await act(async () => {
      await result.current.mutateAsync({ id: 'wo-123', quantityProduced: 0 });
    });

    expect(mockApiPost).toHaveBeenCalledWith('/manufacturing/work-orders/wo-123/complete', {
      quantityProduced: 0,
    });
    expect(mockApiPost).toHaveBeenCalledTimes(1);
  });

  it('AC3: resolves quantity from producedQuantity for backward compatibility', async () => {
    const { result } = renderHook(() => useCompleteWorkOrder(), { wrapper: createWrapper() });

    await act(async () => {
      await result.current.mutateAsync({ id: 'wo-123', producedQuantity: 10 });
    });

    expect(mockApiPost).toHaveBeenCalledWith('/manufacturing/work-orders/wo-123/complete', {
      quantityProduced: 10,
    });
    expect(mockApiPost).toHaveBeenCalledTimes(1);
  });

  it('AC3: allows boundary zero quantity when explicitly provided via producedQuantity', async () => {
    const { result } = renderHook(() => useCompleteWorkOrder(), { wrapper: createWrapper() });

    await act(async () => {
      await result.current.mutateAsync({ id: 'wo-123', producedQuantity: 0 });
    });

    expect(mockApiPost).toHaveBeenCalledWith('/manufacturing/work-orders/wo-123/complete', {
      quantityProduced: 0,
    });
    expect(mockApiPost).toHaveBeenCalledTimes(1);
  });

  it('AC4: prioritizes quantityProduced when both quantityProduced and producedQuantity are provided', async () => {
    const { result } = renderHook(() => useCompleteWorkOrder(), { wrapper: createWrapper() });

    await act(async () => {
      await result.current.mutateAsync({
        id: 'wo-123',
        quantityProduced: 7,
        producedQuantity: 3,
      });
    });

    expect(mockApiPost).toHaveBeenCalledWith('/manufacturing/work-orders/wo-123/complete', {
      quantityProduced: 7,
    });
    expect(mockApiPost).toHaveBeenCalledTimes(1);
  });
});
