import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

jest.mock('@/lib/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn() },
}));

const mockUseSession = jest.fn();
jest.mock('next-auth/react', () => ({
  useSession: () => mockUseSession(),
}));

import api from '@/lib/api';
import { useBaseCurrency, useCompleteOpeningBalances } from './use-organization';

const mockGet = api.get as jest.Mock;
const mockPost = api.post as jest.Mock;

function wrapper(): React.FC<{ children: React.ReactNode }> {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper = ({ children }: { children: React.ReactNode }): React.ReactElement =>
    React.createElement(QueryClientProvider, { client: qc }, children);
  Wrapper.displayName = 'TestWrapper';
  return Wrapper;
}

describe('useBaseCurrency', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseSession.mockReturnValue({ data: { user: { organizationId: 'org-1' } } });
  });

  it('reads the dedicated base-currency lookup, not the settings.view-guarded GET /organization', async () => {
    mockGet.mockResolvedValueOnce({ data: { baseCurrency: 'EGP' } });

    const { result } = renderHook(() => useBaseCurrency(), { wrapper: wrapper() });

    await waitFor(() => expect(result.current).toBe('EGP'));
    expect(mockGet).toHaveBeenCalledTimes(1);
    expect(mockGet).toHaveBeenCalledWith('/organization/base-currency');
  });

  it('does not query before the session knows the organization', () => {
    mockUseSession.mockReturnValue({ data: null });

    const { result } = renderHook(() => useBaseCurrency(), { wrapper: wrapper() });

    expect(result.current).toBeUndefined();
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('stays unknown (never a guessed currency) when the lookup fails', async () => {
    mockGet.mockRejectedValueOnce(new Error('HTTP 500'));

    const { result } = renderHook(() => useBaseCurrency(), { wrapper: wrapper() });

    await waitFor(() => expect(mockGet).toHaveBeenCalled());
    expect(result.current).toBeUndefined();
  });
});

describe('useCompleteOpeningBalances', () => {
  beforeEach(() => jest.clearAllMocks());

  it('sends opening-balance amounts as exact decimal strings', async () => {
    mockPost.mockResolvedValueOnce({ data: { success: true } });
    const { result } = renderHook(() => useCompleteOpeningBalances(), { wrapper: wrapper() });

    await act(async () => {
      await result.current.mutateAsync({
        balances: [
          { accountId: 'acc-bank', amount: '1500.1234', isDebit: true },
          { accountId: 'acc-equity', amount: '1500.1234', isDebit: false },
        ],
        openingDate: '2026-01-01',
      });
    });

    expect(mockPost).toHaveBeenCalledWith('/organization/onboarding/opening-balances', {
      balances: [
        { accountId: 'acc-bank', amount: '1500.1234', isDebit: true },
        { accountId: 'acc-equity', amount: '1500.1234', isDebit: false },
      ],
      openingDate: '2026-01-01',
    });
    const sent = mockPost.mock.calls[0][1] as { balances: Array<{ amount: unknown }> };
    for (const line of sent.balances) expect(typeof line.amount).toBe('string');
  });
});
