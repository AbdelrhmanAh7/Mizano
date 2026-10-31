/**
 * Regression tests for use-all-settings hooks.
 *
 * Errors 7-8: GET /api/organizations/settings → 404
 *             PATCH /api/organizations/settings/branding → 404
 * Root cause: Frontend was calling /organizations/* (plural) but the NestJS
 *   controller is registered at /organization (singular).
 * Fix: All api calls updated from /organizations/* to /organization/*.
 */

import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// ── Module mocks (factories run before const declarations — keep mocks self-contained) ──

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

// ── Import after mocks ────────────────────────────────────────────────────────

import api from '@/lib/api';
import {
  useAllOrganizationSettings,
  useUpdateBrandingSettings,
  useUpdateGeneralSettings,
  useOrganization,
  useUpdateLockDate,
} from './use-all-settings';

const mockGet = api.get as jest.Mock;
const mockPatch = api.patch as jest.Mock;

// ── Helpers ───────────────────────────────────────────────────────────────────

const createWrapper = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
  Wrapper.displayName = 'TestWrapper';
  return Wrapper;
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('useAllOrganizationSettings', () => {
  beforeEach(() => jest.clearAllMocks());

  it('calls GET /organization/settings (singular, not /organizations/)', async () => {
    mockGet.mockResolvedValueOnce({ data: {} });
    renderHook(() => useAllOrganizationSettings(), {
      wrapper: createWrapper(),
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(mockGet).toHaveBeenCalledWith('/organization/settings');
    expect(mockGet).not.toHaveBeenCalledWith('/organizations/settings');
  });
});

describe('useUpdateBrandingSettings', () => {
  beforeEach(() => jest.clearAllMocks());

  it('calls PATCH /organization/settings/branding (singular, regression: was 404)', async () => {
    mockPatch.mockResolvedValueOnce({ data: {} });
    const { result } = renderHook(() => useUpdateBrandingSettings(), {
      wrapper: createWrapper(),
    });
    await act(async () => {
      await result.current.mutateAsync({ primaryColor: '#ff0000' });
    });
    expect(mockPatch).toHaveBeenCalledWith('/organization/settings/branding', {
      primaryColor: '#ff0000',
    });
    expect(mockPatch).not.toHaveBeenCalledWith(
      expect.stringContaining('/organizations/'),
      expect.anything(),
    );
  });
});

describe('useUpdateGeneralSettings', () => {
  beforeEach(() => jest.clearAllMocks());

  it('calls PATCH /organization/settings/general', async () => {
    mockPatch.mockResolvedValueOnce({ data: {} });
    const { result } = renderHook(() => useUpdateGeneralSettings(), {
      wrapper: createWrapper(),
    });
    await act(async () => {
      await result.current.mutateAsync({ name: 'Acme Corp' });
    });
    expect(mockPatch).toHaveBeenCalledWith('/organization/settings/general', { name: 'Acme Corp' });
  });
});

describe('useOrganization', () => {
  beforeEach(() => jest.clearAllMocks());

  it('calls GET /organization (singular)', async () => {
    mockGet.mockResolvedValueOnce({ data: {} });
    renderHook(() => useOrganization(), {
      wrapper: createWrapper(),
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(mockGet).toHaveBeenCalledWith('/organization');
    expect(mockGet).not.toHaveBeenCalledWith('/organizations');
  });
});

describe('useUpdateLockDate', () => {
  beforeEach(() => jest.clearAllMocks());

  it('calls PATCH /organization/lock-date (singular)', async () => {
    mockPatch.mockResolvedValueOnce({ data: {} });
    const { result } = renderHook(() => useUpdateLockDate(), {
      wrapper: createWrapper(),
    });
    await act(async () => {
      await result.current.mutateAsync('2026-12-31');
    });
    expect(mockPatch).toHaveBeenCalledWith('/organization/lock-date', { lockDate: '2026-12-31' });
  });
});
