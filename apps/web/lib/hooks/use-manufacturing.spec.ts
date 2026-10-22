/**
 * Unit tests covering AC1-AC5 for useCompleteWorkOrder hook and workOrderApi.complete (@issue-401).
 * Validates wire payload contract (producedQuantity + quantityProduced), null/undefined/NaN rejection,
 * boundary zero preservation, and backward compatibility.
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

describe('useCompleteWorkOrder and workOrderApi.complete (@issue-401)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockApiPost.mockResolvedValue({ data: { id: 'wo-123', status: 'COMPLETED' } });
  });

  describe('AC1: Wire contract safety (dual-key payload with quantityProduced and producedQuantity)', () => {
    it('calls api.post with both quantityProduced and producedQuantity when quantityProduced is provided', async () => {
      const { result } = renderHook(() => useCompleteWorkOrder(), { wrapper: createWrapper() });

      await act(async () => {
        await result.current.mutateAsync({ id: 'wo-123', quantityProduced: 5 });
      });

      expect(mockApiPost).toHaveBeenCalledWith('/manufacturing/work-orders/wo-123/complete', {
        producedQuantity: 5,
        quantityProduced: 5,
      });
      expect(mockApiPost).toHaveBeenCalledTimes(1);
    });

    it('calls api.post with both quantityProduced and producedQuantity when legacy producedQuantity is provided', async () => {
      const { result } = renderHook(() => useCompleteWorkOrder(), { wrapper: createWrapper() });

      await act(async () => {
        await result.current.mutateAsync({ id: 'wo-123', producedQuantity: 10 });
      });

      expect(mockApiPost).toHaveBeenCalledWith('/manufacturing/work-orders/wo-123/complete', {
        producedQuantity: 10,
        quantityProduced: 10,
      });
      expect(mockApiPost).toHaveBeenCalledTimes(1);
    });
  });

  describe('AC2: Rejects undefined / omitted completion quantity', () => {
    it('rejects completion when both quantityProduced and producedQuantity are absent/undefined', async () => {
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

    it('rejects completion when quantityProduced is explicitly undefined', async () => {
      const { result } = renderHook(() => useCompleteWorkOrder(), { wrapper: createWrapper() });

      await expect(
        act(async () => {
          await result.current.mutateAsync({ id: 'wo-123', quantityProduced: undefined });
        }),
      ).rejects.toThrow('A completion quantity is required');

      expect(mockApiPost).not.toHaveBeenCalled();
    });
  });

  describe('AC3: Rejects explicitly null completion quantity', () => {
    it('rejects completion when quantityProduced is explicitly null', async () => {
      const { result } = renderHook(() => useCompleteWorkOrder(), { wrapper: createWrapper() });

      await expect(
        act(async () => {
          await result.current.mutateAsync({
            id: 'wo-123',
            quantityProduced: null as unknown as number,
          });
        }),
      ).rejects.toThrow('A completion quantity is required');

      expect(mockApiPost).not.toHaveBeenCalled();
    });

    it('rejects completion when legacy producedQuantity is explicitly null', async () => {
      const { result } = renderHook(() => useCompleteWorkOrder(), { wrapper: createWrapper() });

      await expect(
        act(async () => {
          await result.current.mutateAsync({
            id: 'wo-123',
            producedQuantity: null as unknown as number,
          });
        }),
      ).rejects.toThrow('A completion quantity is required');

      expect(mockApiPost).not.toHaveBeenCalled();
    });
  });

  describe('AC4: Rejects NaN completion quantity', () => {
    it('rejects completion when quantityProduced is NaN', async () => {
      const { result } = renderHook(() => useCompleteWorkOrder(), { wrapper: createWrapper() });

      await expect(
        act(async () => {
          await result.current.mutateAsync({ id: 'wo-123', quantityProduced: Number.NaN });
        }),
      ).rejects.toThrow('A completion quantity is required');

      expect(mockApiPost).not.toHaveBeenCalled();
    });

    it('rejects completion when legacy producedQuantity is NaN', async () => {
      const { result } = renderHook(() => useCompleteWorkOrder(), { wrapper: createWrapper() });

      await expect(
        act(async () => {
          await result.current.mutateAsync({ id: 'wo-123', producedQuantity: Number.NaN });
        }),
      ).rejects.toThrow('A completion quantity is required');

      expect(mockApiPost).not.toHaveBeenCalled();
    });
  });

  describe('AC5: Boundary zero and precedence handling', () => {
    it('allows boundary zero quantity when explicitly provided via quantityProduced', async () => {
      const { result } = renderHook(() => useCompleteWorkOrder(), { wrapper: createWrapper() });

      await act(async () => {
        await result.current.mutateAsync({ id: 'wo-123', quantityProduced: 0 });
      });

      expect(mockApiPost).toHaveBeenCalledWith('/manufacturing/work-orders/wo-123/complete', {
        producedQuantity: 0,
        quantityProduced: 0,
      });
      expect(mockApiPost).toHaveBeenCalledTimes(1);
    });

    it('allows boundary zero quantity when explicitly provided via producedQuantity', async () => {
      const { result } = renderHook(() => useCompleteWorkOrder(), { wrapper: createWrapper() });

      await act(async () => {
        await result.current.mutateAsync({ id: 'wo-123', producedQuantity: 0 });
      });

      expect(mockApiPost).toHaveBeenCalledWith('/manufacturing/work-orders/wo-123/complete', {
        producedQuantity: 0,
        quantityProduced: 0,
      });
      expect(mockApiPost).toHaveBeenCalledTimes(1);
    });

    it('prioritizes quantityProduced when both quantityProduced and producedQuantity are provided', async () => {
      const { result } = renderHook(() => useCompleteWorkOrder(), { wrapper: createWrapper() });

      await act(async () => {
        await result.current.mutateAsync({
          id: 'wo-123',
          quantityProduced: 7,
          producedQuantity: 3,
        });
      });

      expect(mockApiPost).toHaveBeenCalledWith('/manufacturing/work-orders/wo-123/complete', {
        producedQuantity: 7,
        quantityProduced: 7,
      });
      expect(mockApiPost).toHaveBeenCalledTimes(1);
    });
  });
});
