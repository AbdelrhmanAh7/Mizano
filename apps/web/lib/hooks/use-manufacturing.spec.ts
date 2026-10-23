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
import {
  useCompleteWorkOrder,
  resolveQuantityProduced,
  CompleteWorkOrderInput,
} from './use-manufacturing';

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

describe('resolveQuantityProduced (@issue-334)', () => {
  it('AC1: throws descriptive error when neither quantity field is provided', () => {
    expect(() => resolveQuantityProduced({})).toThrow(
      'A valid completion quantity (quantityProduced or producedQuantity) is required',
    );
  });

  it('AC1: throws descriptive error when both fields are null or undefined', () => {
    expect(() =>
      resolveQuantityProduced({ quantityProduced: null, producedQuantity: undefined }),
    ).toThrow('A valid completion quantity (quantityProduced or producedQuantity) is required');
  });

  it('AC1: throws descriptive error when quantity is NaN', () => {
    expect(() => resolveQuantityProduced({ quantityProduced: NaN })).toThrow(
      'A valid completion quantity (quantityProduced or producedQuantity) is required',
    );
  });

  it('AC2: preserves explicit 0 quantity without defaulting', () => {
    expect(resolveQuantityProduced({ quantityProduced: 0 })).toBe(0);
    expect(resolveQuantityProduced({ producedQuantity: 0 })).toBe(0);
  });

  it('AC3: resolves quantityProduced when provided', () => {
    expect(resolveQuantityProduced({ quantityProduced: 5 })).toBe(5);
  });

  it('AC3: resolves producedQuantity for backward compatibility', () => {
    expect(resolveQuantityProduced({ producedQuantity: 10 })).toBe(10);
  });

  it('AC3: prioritizes quantityProduced over producedQuantity when both are given', () => {
    expect(resolveQuantityProduced({ quantityProduced: 7, producedQuantity: 3 })).toBe(7);
  });
});

describe('useCompleteWorkOrder (@issue-334)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockApiPost.mockResolvedValue({ data: { id: 'wo-123', status: 'COMPLETED' } });
  });

  it('AC1: rejects completion when quantity is absent and sends no API request', async () => {
    const { result } = renderHook(() => useCompleteWorkOrder(), { wrapper: createWrapper() });

    await expect(
      act(async () => {
        await result.current.mutateAsync({ id: 'wo-123' } as unknown as CompleteWorkOrderInput);
      }),
    ).rejects.toThrow(
      'A valid completion quantity (quantityProduced or producedQuantity) is required',
    );

    expect(mockApiPost).not.toHaveBeenCalled();
  });

  it('AC2: forwards explicit zero quantityProduced to the API', async () => {
    const { result } = renderHook(() => useCompleteWorkOrder(), { wrapper: createWrapper() });

    await act(async () => {
      await result.current.mutateAsync({ id: 'wo-123', quantityProduced: 0 });
    });

    expect(mockApiPost).toHaveBeenCalledWith('/manufacturing/work-orders/wo-123/complete', {
      quantityProduced: 0,
    });
    expect(mockApiPost).toHaveBeenCalledTimes(1);
  });

  it('AC3: sends quantityProduced in API request when quantityProduced is given', async () => {
    const { result } = renderHook(() => useCompleteWorkOrder(), { wrapper: createWrapper() });

    await act(async () => {
      await result.current.mutateAsync({ id: 'wo-123', quantityProduced: 5 });
    });

    expect(mockApiPost).toHaveBeenCalledWith('/manufacturing/work-orders/wo-123/complete', {
      quantityProduced: 5,
    });
    expect(mockApiPost).toHaveBeenCalledTimes(1);
  });

  it('AC3: sends quantityProduced in API request when producedQuantity is given', async () => {
    const { result } = renderHook(() => useCompleteWorkOrder(), { wrapper: createWrapper() });

    await act(async () => {
      await result.current.mutateAsync({ id: 'wo-123', producedQuantity: 10 });
    });

    expect(mockApiPost).toHaveBeenCalledWith('/manufacturing/work-orders/wo-123/complete', {
      quantityProduced: 10,
    });
    expect(mockApiPost).toHaveBeenCalledTimes(1);
  });

  it('AC3: prioritizes quantityProduced when both are provided', async () => {
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

describe('CompleteWorkOrderInput compile-time type safety (@issue-334)', () => {
  it('AC4: accepts valid quantity fields and rejects calls missing quantity', () => {
    const validWithQuantityProduced: CompleteWorkOrderInput = { id: 'wo-1', quantityProduced: 5 };
    const validWithProducedQuantity: CompleteWorkOrderInput = { id: 'wo-1', producedQuantity: 5 };
    const validWithBoth: CompleteWorkOrderInput = {
      id: 'wo-1',
      quantityProduced: 5,
      producedQuantity: 2,
    };
    expect(validWithQuantityProduced).toBeDefined();
    expect(validWithProducedQuantity).toBeDefined();
    expect(validWithBoth).toBeDefined();

    // @ts-expect-error - at least one quantity field is required
    const invalidMissingQuantity: CompleteWorkOrderInput = { id: 'wo-1' };
    expect(invalidMissingQuantity).toBeDefined();
  });
});
