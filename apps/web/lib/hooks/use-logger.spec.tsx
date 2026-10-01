/**
 * Tests for useLogger: authenticated API usage and handling of 401/403.
 */

import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('@mizano/shared-types', () => ({
  LogLevel: { ERROR: 'error', WARN: 'warn' },
  LogSource: { FRONTEND: 'frontend', BACKEND: 'backend', AI_MODEL: 'ai-model' },
  LogStatus: { OPEN: 'open', FIXED: 'fixed', IGNORED: 'ignored', TEST_COVERED: 'test-covered' },
}));

const mockGet = jest.fn();
const mockPost = jest.fn();
const mockDelete = jest.fn();
jest.mock('@/lib/api', () => ({
  __esModule: true,
  default: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
    delete: (...args: unknown[]) => mockDelete(...args),
  },
}));

import { isAccessDenied, useLogger } from './use-logger';

function httpError(status: number): Error & { response: { status: number } } {
  return Object.assign(new Error(`Request failed with status code ${status}`), {
    response: { status },
  });
}

function wrapper() {
  const queryClient = new QueryClient();
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe('isAccessDenied', () => {
  it('is true only for 401 and 403 responses', () => {
    expect(isAccessDenied(httpError(401))).toBe(true);
    expect(isAccessDenied(httpError(403))).toBe(true);
    expect(isAccessDenied(httpError(500))).toBe(false);
    expect(isAccessDenied(httpError(404))).toBe(false);
    expect(isAccessDenied(new Error('network'))).toBe(false);
    expect(isAccessDenied(null)).toBe(false);
    expect(isAccessDenied(undefined)).toBe(false);
  });
});

describe('useLogger', () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockPost.mockReset();
    mockDelete.mockReset();
  });

  it('reads logs and stats through the authenticated API client', async () => {
    mockGet.mockImplementation((url: string) =>
      Promise.resolve({ data: url.startsWith('/logger/stats') ? { totalErrors: 1 } : [] }),
    );

    const { result } = renderHook(() => useLogger(), { wrapper: wrapper() });

    await waitFor(() => expect(result.current.stats).toEqual({ totalErrors: 1 }));
    const urls = mockGet.mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.startsWith('/logger/logs'))).toBe(true);
    expect(urls).toContain('/logger/stats');
    expect(result.current.accessDenied).toBe(false);
  });

  it('flags access denied on 403 and does not retry', async () => {
    mockGet.mockRejectedValue(httpError(403));

    const { result } = renderHook(() => useLogger(), { wrapper: wrapper() });

    await waitFor(() => expect(result.current.accessDenied).toBe(true));
    // one attempt per endpoint, no retries
    expect(mockGet).toHaveBeenCalledTimes(2);
  });

  it('does not treat server errors as access denied', async () => {
    mockGet.mockRejectedValue(httpError(500));

    const { result } = renderHook(() => useLogger(), { wrapper: wrapper() });

    await waitFor(() => expect(mockGet.mock.calls.length).toBeGreaterThanOrEqual(2));
    expect(result.current.accessDenied).toBe(false);
  });

  it('report-only consumers never call the admin read endpoints', async () => {
    const { result } = renderHook(() => useLogger({ poll: false }), { wrapper: wrapper() });

    await act(async () => {
      await Promise.resolve();
    });
    expect(mockGet).not.toHaveBeenCalled();
    expect(result.current.accessDenied).toBe(false);
  });

  it('reports errors through the authenticated API without polling the read endpoints', async () => {
    mockPost.mockResolvedValue({ data: { id: 'e1', message: 'boom' } });

    const { result } = renderHook(() => useLogger({ poll: false }), { wrapper: wrapper() });

    await act(async () => {
      result.current.captureError(new Error('boom'));
      await Promise.resolve();
    });

    await waitFor(() => expect(mockPost).toHaveBeenCalled());
    expect(mockPost.mock.calls[0][0]).toBe('/logger/capture');
    expect(mockGet).not.toHaveBeenCalled();
  });
});
