import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// ── Mocks ──────────────────────────────────────────────────────

jest.mock('@/lib/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() },
  usersApi: {
    getAll: jest.fn(),
    getOne: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
}));

jest.mock('@/components/ui/use-toast', () => ({
  useToast: () => ({ toast: jest.fn() }),
}));

// ── Imports after mocks ────────────────────────────────────────

import { usersApi } from '@/lib/api';
import {
  useUsers,
  useUser,
  useCreateUser,
  useUpdateUser,
  useDeleteUser,
  getUserStatusColor,
} from './use-users';

const mockGetAll = usersApi.getAll as jest.Mock;
const mockGetOne = usersApi.getOne as jest.Mock;
const mockCreate = usersApi.create as jest.Mock;
const mockUpdate = usersApi.update as jest.Mock;
const mockDelete = usersApi.delete as jest.Mock;

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

describe('useUsers', () => {
  beforeEach(() => jest.clearAllMocks());

  it('fetches users via usersApi.getAll', async () => {
    mockGetAll.mockResolvedValue({ data: { data: [], meta: {} } });
    renderHook(() => useUsers(), { wrapper: createWrapper() });
    await flush();
    expect(mockGetAll).toHaveBeenCalled();
  });

  it('passes params to getAll', async () => {
    mockGetAll.mockResolvedValue({ data: { data: [], meta: {} } });
    renderHook(() => useUsers({ search: 'john', status: 'ACTIVE' }), {
      wrapper: createWrapper(),
    });
    await flush();
    expect(mockGetAll).toHaveBeenCalledWith({ search: 'john', status: 'ACTIVE' });
  });
});

describe('useUser', () => {
  beforeEach(() => jest.clearAllMocks());

  it('fetches a single user by id', async () => {
    mockGetOne.mockResolvedValue({ data: { id: 'u1', name: 'Alice' } });
    renderHook(() => useUser('u1'), { wrapper: createWrapper() });
    await flush();
    expect(mockGetOne).toHaveBeenCalledWith('u1');
  });

  it('does not fetch when id is undefined', async () => {
    renderHook(() => useUser(undefined), { wrapper: createWrapper() });
    await flush();
    expect(mockGetOne).not.toHaveBeenCalled();
  });
});

describe('useCreateUser', () => {
  beforeEach(() => jest.clearAllMocks());

  it('calls usersApi.create with user data', async () => {
    mockCreate.mockResolvedValue({ data: { id: 'u1' } });
    const { result } = renderHook(() => useCreateUser(), { wrapper: createWrapper() });
    await act(async () => {
      await result.current.mutateAsync({
        name: 'Bob',
        email: 'bob@test.com',
        password: 'Password1',
        roleId: 'r1',
      });
    });
    expect(mockCreate).toHaveBeenCalledWith({
      name: 'Bob',
      email: 'bob@test.com',
      password: 'Password1',
      roleId: 'r1',
    });
  });
});

describe('useUpdateUser', () => {
  beforeEach(() => jest.clearAllMocks());

  it('calls usersApi.update with id and data', async () => {
    mockUpdate.mockResolvedValue({ data: { id: 'u1' } });
    const { result } = renderHook(() => useUpdateUser(), { wrapper: createWrapper() });
    await act(async () => {
      await result.current.mutateAsync({
        id: 'u1',
        data: { name: 'Updated', status: 'INACTIVE' as const },
      });
    });
    expect(mockUpdate).toHaveBeenCalledWith('u1', { name: 'Updated', status: 'INACTIVE' });
  });
});

describe('useDeleteUser', () => {
  beforeEach(() => jest.clearAllMocks());

  it('calls usersApi.delete with user id', async () => {
    mockDelete.mockResolvedValue({ data: { message: 'ok' } });
    const { result } = renderHook(() => useDeleteUser(), { wrapper: createWrapper() });
    await act(async () => {
      await result.current.mutateAsync('u1');
    });
    expect(mockDelete).toHaveBeenCalledWith('u1');
  });
});

describe('getUserStatusColor', () => {
  it('returns green for ACTIVE', () => {
    expect(getUserStatusColor('ACTIVE')).toContain('green');
  });

  it('returns gray for INACTIVE', () => {
    expect(getUserStatusColor('INACTIVE')).toContain('gray');
  });

  it('returns red for SUSPENDED', () => {
    expect(getUserStatusColor('SUSPENDED')).toContain('red');
  });

  it('returns gray for unknown status', () => {
    expect(getUserStatusColor('UNKNOWN')).toContain('gray');
  });
});
