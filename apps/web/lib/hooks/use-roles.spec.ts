import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// ── Mocks ──────────────────────────────────────────────────────

jest.mock('@/lib/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() },
  rolesApi: {
    getAll: jest.fn(),
    getOne: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    seedDefaults: jest.fn(),
    assignRole: jest.fn(),
  },
}));

jest.mock('@/components/ui/use-toast', () => ({
  useToast: () => ({ toast: jest.fn() }),
}));

// ── Imports after mocks ────────────────────────────────────────

import { rolesApi } from '@/lib/api';
import {
  useRoles,
  useRole,
  useCreateRole,
  useUpdateRole,
  useDeleteRole,
  useSeedDefaultRoles,
  useAssignRole,
} from './use-roles';

const mockGetAll = rolesApi.getAll as jest.Mock;
const mockGetOne = rolesApi.getOne as jest.Mock;
const mockCreate = rolesApi.create as jest.Mock;
const mockUpdate = rolesApi.update as jest.Mock;
const mockDelete = rolesApi.delete as jest.Mock;
const mockSeedDefaults = rolesApi.seedDefaults as jest.Mock;
const mockAssignRole = rolesApi.assignRole as jest.Mock;

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

describe('useRoles', () => {
  beforeEach(() => jest.clearAllMocks());

  it('fetches roles via rolesApi.getAll', async () => {
    mockGetAll.mockResolvedValue({ data: { data: [], meta: {} } });
    renderHook(() => useRoles(), { wrapper: createWrapper() });
    await flush();
    expect(mockGetAll).toHaveBeenCalled();
  });
});

describe('useRole', () => {
  beforeEach(() => jest.clearAllMocks());

  it('fetches a single role by id', async () => {
    mockGetOne.mockResolvedValue({ data: { id: 'r1', name: 'Admin' } });
    renderHook(() => useRole('r1'), { wrapper: createWrapper() });
    await flush();
    expect(mockGetOne).toHaveBeenCalledWith('r1');
  });

  it('does not fetch when id is undefined', async () => {
    renderHook(() => useRole(undefined), { wrapper: createWrapper() });
    await flush();
    expect(mockGetOne).not.toHaveBeenCalled();
  });
});

describe('useCreateRole', () => {
  beforeEach(() => jest.clearAllMocks());

  it('calls rolesApi.create with role data', async () => {
    mockCreate.mockResolvedValue({ data: { id: 'r1' } });
    const { result } = renderHook(() => useCreateRole(), { wrapper: createWrapper() });
    await act(async () => {
      await result.current.mutateAsync({
        name: 'Manager',
        permissions: [{ module: 'sales', actions: ['view'] }],
      });
    });
    expect(mockCreate).toHaveBeenCalledWith({
      name: 'Manager',
      permissions: [{ module: 'sales', actions: ['view'] }],
    });
  });
});

describe('useUpdateRole', () => {
  beforeEach(() => jest.clearAllMocks());

  it('calls rolesApi.update with id and data', async () => {
    mockUpdate.mockResolvedValue({ data: { id: 'r1' } });
    const { result } = renderHook(() => useUpdateRole(), { wrapper: createWrapper() });
    await act(async () => {
      await result.current.mutateAsync({ id: 'r1', data: { name: 'Updated' } });
    });
    expect(mockUpdate).toHaveBeenCalledWith('r1', { name: 'Updated' });
  });
});

describe('useDeleteRole', () => {
  beforeEach(() => jest.clearAllMocks());

  it('calls rolesApi.delete with role id', async () => {
    mockDelete.mockResolvedValue({ data: { message: 'ok' } });
    const { result } = renderHook(() => useDeleteRole(), { wrapper: createWrapper() });
    await act(async () => {
      await result.current.mutateAsync('r1');
    });
    expect(mockDelete).toHaveBeenCalledWith('r1');
  });
});

describe('useSeedDefaultRoles', () => {
  beforeEach(() => jest.clearAllMocks());

  it('calls rolesApi.seedDefaults', async () => {
    mockSeedDefaults.mockResolvedValue({ data: { message: 'Seeded 5 new roles' } });
    const { result } = renderHook(() => useSeedDefaultRoles(), { wrapper: createWrapper() });
    await act(async () => {
      await result.current.mutateAsync();
    });
    expect(mockSeedDefaults).toHaveBeenCalled();
  });
});

describe('useAssignRole', () => {
  beforeEach(() => jest.clearAllMocks());

  it('calls rolesApi.assignRole with userId and roleId', async () => {
    mockAssignRole.mockResolvedValue({ data: { message: 'assigned' } });
    const { result } = renderHook(() => useAssignRole(), { wrapper: createWrapper() });
    await act(async () => {
      await result.current.mutateAsync({ userId: 'u1', roleId: 'r1' });
    });
    expect(mockAssignRole).toHaveBeenCalledWith({ userId: 'u1', roleId: 'r1' });
  });
});
