import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// ── Mocks ──────────────────────────────────────────────────────

jest.mock('@/lib/api', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    patch: jest.fn(),
  },
}));

jest.mock('@/components/ui/use-toast', () => ({
  useToast: () => ({ toast: jest.fn() }),
}));

// ── Imports after mocks ────────────────────────────────────────

import api from '@/lib/api';
import { useAccountSettings, useUpdateAccountSettings } from './use-organization-settings';

const mockGet = api.get as jest.Mock;
const mockPatch = api.patch as jest.Mock;

// ── Helpers ────────────────────────────────────────────────────

const createWrapper = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
  Wrapper.displayName = 'TestWrapper';
  return Wrapper;
};

const flush = () => act(() => new Promise((r) => setTimeout(r, 0)));

// ── Tests ──────────────────────────────────────────────────────

describe('useAccountSettings', () => {
  beforeEach(() => jest.clearAllMocks());

  it('calls GET /organization/account-settings (singular)', async () => {
    mockGet.mockResolvedValueOnce({
      data: {
        defaultArAccountId: 'acc-1',
        defaultApAccountId: 'acc-2',
      },
    });
    const { result } = renderHook(() => useAccountSettings(), {
      wrapper: createWrapper(),
    });
    await flush();
    expect(mockGet).toHaveBeenCalledWith('/organization/account-settings');
    expect(mockGet).not.toHaveBeenCalledWith('/organizations/account-settings');
  });

  it('returns account settings data', async () => {
    const mockData = {
      defaultArAccountId: 'acc-1',
      defaultRevenueAccountId: 'acc-2',
      defaultVatPayableAccountId: null,
      defaultApAccountId: 'acc-3',
      defaultVatReceivableAccountId: null,
      defaultBankAccountId: null,
      defaultCashAccountId: null,
      defaultSalesReturnsAccountId: null,
    };
    mockGet.mockResolvedValueOnce({ data: mockData });
    const { result } = renderHook(() => useAccountSettings(), {
      wrapper: createWrapper(),
    });
    await flush();
    expect(result.current.data).toEqual(mockData);
  });
});

describe('useUpdateAccountSettings', () => {
  beforeEach(() => jest.clearAllMocks());

  it('calls PATCH /organization/account-settings (singular)', async () => {
    mockPatch.mockResolvedValueOnce({ data: {} });
    const { result } = renderHook(() => useUpdateAccountSettings(), {
      wrapper: createWrapper(),
    });
    await act(async () => {
      await result.current.mutateAsync({ defaultArAccountId: 'acc-new' });
    });
    expect(mockPatch).toHaveBeenCalledWith('/organization/account-settings', {
      defaultArAccountId: 'acc-new',
    });
    expect(mockPatch).not.toHaveBeenCalledWith(
      expect.stringContaining('/organizations/'),
      expect.anything(),
    );
  });

  it('sends partial update data', async () => {
    mockPatch.mockResolvedValueOnce({ data: {} });
    const { result } = renderHook(() => useUpdateAccountSettings(), {
      wrapper: createWrapper(),
    });
    await act(async () => {
      await result.current.mutateAsync({
        defaultBankAccountId: 'bank-1',
        defaultCashAccountId: 'cash-1',
      });
    });
    expect(mockPatch).toHaveBeenCalledWith('/organization/account-settings', {
      defaultBankAccountId: 'bank-1',
      defaultCashAccountId: 'cash-1',
    });
  });
});
