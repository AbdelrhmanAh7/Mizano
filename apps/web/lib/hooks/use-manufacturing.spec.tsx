import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

jest.mock('@/lib/api', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
  },
}));

import api from '@/lib/api';
import { useCompleteWorkOrder } from './use-manufacturing';

const mockPost = api.post as jest.Mock;

function createWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  return Wrapper;
}

describe('useCompleteWorkOrder', () => {
  beforeEach(() => jest.clearAllMocks());

  it('sends quantityProduced, matching the API completion DTO', async () => {
    mockPost.mockResolvedValueOnce({ data: { id: 'wo-1' } });
    const { result } = renderHook(() => useCompleteWorkOrder(), { wrapper: createWrapper() });

    await act(async () => {
      await result.current.mutateAsync({ id: 'wo-1', producedQuantity: 3 });
    });

    expect(mockPost).toHaveBeenCalledWith('/manufacturing/work-orders/wo-1/complete', {
      quantityProduced: 3,
    });
  });
});
