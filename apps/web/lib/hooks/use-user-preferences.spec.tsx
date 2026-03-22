/**
 * Tests for useUserPreferences, useUpdateTourProgress, and useDismissTour hooks.
 * Regression: ensures queryFn never returns undefined (TanStack Query requirement).
 */

import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Mock the API module
const mockGet = jest.fn();
const mockPatch = jest.fn();
const mockPost = jest.fn();

jest.mock('@/lib/api', () => ({
  __esModule: true,
  default: {
    get: (...args: unknown[]) => mockGet(...args),
    patch: (...args: unknown[]) => mockPatch(...args),
    post: (...args: unknown[]) => mockPost(...args),
  },
}));

import { useUserPreferences, useUpdateTourProgress, useDismissTour } from './use-user-preferences';

const MOCK_PREFERENCES = {
  id: 'pref-1',
  userId: 'user-1',
  tourProgress: { welcome: { completed: true } },
  tourDismissed: [],
  lastTourSeenAt: null,
  theme: 'light',
  sidebarCollapsed: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

beforeEach(() => {
  mockGet.mockReset();
  mockPatch.mockReset();
  mockPost.mockReset();
});

describe('useUserPreferences', () => {
  it('returns preferences data from the API', async () => {
    mockGet.mockResolvedValue({ data: MOCK_PREFERENCES });

    const { result } = renderHook(() => useUserPreferences(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual(MOCK_PREFERENCES);
    expect(mockGet).toHaveBeenCalledWith('/user/preferences', expect.any(Object));
  });

  it('never returns undefined from queryFn (regression)', async () => {
    // Simulate API returning data wrapped in { data: ... } (Axios response shape)
    mockGet.mockResolvedValue({ data: MOCK_PREFERENCES });

    const { result } = renderHook(() => useUserPreferences(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    // The critical assertion: data must not be undefined
    expect(result.current.data).toBeDefined();
    expect(result.current.data).not.toBeUndefined();
  });

  it('handles API error gracefully', async () => {
    mockGet.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useUserPreferences(), {
      wrapper: createWrapper(),
    });

    // The hook has retry: 1, so it retries once before failing.
    // Wait with a longer timeout for the retry to complete.
    await waitFor(
      () => {
        expect(result.current.isError).toBe(true);
      },
      { timeout: 10000 },
    );

    expect(result.current.error).toBeDefined();
  });
});

describe('useUpdateTourProgress', () => {
  it('calls the correct API endpoint with tour data', async () => {
    mockPatch.mockResolvedValue({ data: MOCK_PREFERENCES });

    const { result } = renderHook(() => useUpdateTourProgress(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.mutateAsync({
        tourId: 'welcome',
        completed: true,
        currentStep: 3,
      });
    });

    expect(mockPatch).toHaveBeenCalledWith('/user/preferences/tour/welcome', {
      completed: true,
      currentStep: 3,
    });
  });

  it('returns the updated preferences data', async () => {
    const updated = {
      ...MOCK_PREFERENCES,
      tourProgress: { welcome: { completed: true, currentStep: 3 } },
    };
    mockPatch.mockResolvedValue({ data: updated });

    const { result } = renderHook(() => useUpdateTourProgress(), {
      wrapper: createWrapper(),
    });

    let mutationResult: unknown;
    await act(async () => {
      mutationResult = await result.current.mutateAsync({
        tourId: 'welcome',
        completed: true,
        currentStep: 3,
      });
    });

    expect(mutationResult).toEqual(updated);
  });
});

describe('useDismissTour', () => {
  it('calls the correct API endpoint', async () => {
    mockPost.mockResolvedValue({ data: { ...MOCK_PREFERENCES, tourDismissed: ['welcome'] } });

    const { result } = renderHook(() => useDismissTour(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.mutateAsync('welcome');
    });

    expect(mockPost).toHaveBeenCalledWith('/user/preferences/tour/welcome/dismiss');
  });

  it('returns the updated preferences with dismissed tour', async () => {
    const updated = { ...MOCK_PREFERENCES, tourDismissed: ['welcome'] };
    mockPost.mockResolvedValue({ data: updated });

    const { result } = renderHook(() => useDismissTour(), {
      wrapper: createWrapper(),
    });

    let mutationResult: unknown;
    await act(async () => {
      mutationResult = await result.current.mutateAsync('welcome');
    });

    expect(mutationResult).toEqual(updated);
  });
});
