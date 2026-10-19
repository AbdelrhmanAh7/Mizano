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

describe('useCompleteWorkOrder', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockApiPost.mockResolvedValue({ data: { id: 'wo1', status: 'COMPLETED' } });
  });

  it('calls api.post with quantityProduced (not producedQuantity)', async () => {
    const { result } = renderHook(() => useCompleteWorkOrder(), { wrapper: createWrapper() });

    await act(async () => {
      await result.current.mutateAsync({ id: 'wo1', producedQuantity: 5 });
    });

    // The API should be called with quantityProduced, not producedQuantity
    expect(mockApiPost).toHaveBeenCalledWith('/manufacturing/work-orders/wo1/complete', {
      quantityProduced: 5,
    });
    expect(mockApiPost).toHaveBeenCalledTimes(1);
  });

  it('sends the correct payload structure to the API', async () => {
    const { result } = renderHook(() => useCompleteWorkOrder(), { wrapper: createWrapper() });

    await act(async () => {
      await result.current.mutateAsync({ id: 'wo1', producedQuantity: 10 });
    });

    // Verify the payload sent to the API has quantityProduced
    const calledWith = mockApiPost.mock.calls[0];
    expect(calledWith[0]).toBe('/manufacturing/work-orders/wo1/complete');
    expect(calledWith[1]).toEqual({ quantityProduced: 10 });
  });

  it('handles completion with zero quantity', async () => {
    const { result } = renderHook(() => useCompleteWorkOrder(), { wrapper: createWrapper() });

    await act(async () => {
      await result.current.mutateAsync({ id: 'wo1', producedQuantity: 0 });
    });

    expect(mockApiPost).toHaveBeenCalledWith('/manufacturing/work-orders/wo1/complete', {
      quantityProduced: 0,
    });
  });
});
