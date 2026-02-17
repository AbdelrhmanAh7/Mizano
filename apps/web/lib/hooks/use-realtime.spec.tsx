/**
 * Tests for useRealtime hook.
 * Verifies WebSocket connection lifecycle and cache invalidation.
 */

import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// --- Socket.io mock ---
const mockOn = jest.fn();
const mockEmit = jest.fn();
const mockDisconnect = jest.fn();
const mockSocket = { on: mockOn, emit: mockEmit, disconnect: mockDisconnect };

jest.mock('socket.io-client', () => ({
  io: jest.fn(() => mockSocket),
}));

// --- NextAuth mock ---
const mockUseSession = jest.fn();
jest.mock('next-auth/react', () => ({
  useSession: () => mockUseSession(),
}));

import { io } from 'socket.io-client';
import { useRealtime } from './use-realtime';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return {
    queryClient,
    Wrapper: ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  };
}

beforeEach(() => {
  mockOn.mockReset();
  mockEmit.mockReset();
  mockDisconnect.mockReset();
  mockUseSession.mockReset();
  (io as jest.Mock).mockClear();
});

describe('useRealtime', () => {
  it('does not create a socket when there is no session', () => {
    mockUseSession.mockReturnValue({ data: null });
    const { Wrapper } = createWrapper();

    renderHook(() => useRealtime(), { wrapper: Wrapper });

    expect(io).not.toHaveBeenCalled();
  });

  it('does not create a socket when session has no user id', () => {
    mockUseSession.mockReturnValue({ data: { user: {} } });
    const { Wrapper } = createWrapper();

    renderHook(() => useRealtime(), { wrapper: Wrapper });

    expect(io).not.toHaveBeenCalled();
  });

  it('creates a socket and registers event handlers when session exists', () => {
    mockUseSession.mockReturnValue({
      data: { user: { id: 'user-1', organizationId: 'org-1' } },
    });
    const { Wrapper } = createWrapper();

    renderHook(() => useRealtime(), { wrapper: Wrapper });

    expect(io).toHaveBeenCalledWith(expect.stringContaining('/events'), {
      transports: ['websocket'],
      autoConnect: true,
    });

    // Should register handlers for: connect, entity-event, notification, disconnect
    const registeredEvents = mockOn.mock.calls.map((call) => call[0]);
    expect(registeredEvents).toContain('connect');
    expect(registeredEvents).toContain('entity-event');
    expect(registeredEvents).toContain('notification');
    expect(registeredEvents).toContain('disconnect');
  });

  it('joins the org room on connect', () => {
    mockUseSession.mockReturnValue({
      data: { user: { id: 'user-1', organizationId: 'org-1' } },
    });
    const { Wrapper } = createWrapper();

    renderHook(() => useRealtime(), { wrapper: Wrapper });

    // Find the connect handler and invoke it
    const connectCall = mockOn.mock.calls.find((call) => call[0] === 'connect');
    expect(connectCall).toBeDefined();

    const connectHandler = connectCall![1];
    connectHandler();

    expect(mockEmit).toHaveBeenCalledWith('join-org', 'org-1');
  });

  it('does not log a warning for client-initiated disconnect', () => {
    mockUseSession.mockReturnValue({
      data: { user: { id: 'user-1', organizationId: 'org-1' } },
    });
    const { Wrapper } = createWrapper();
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation();

    renderHook(() => useRealtime(), { wrapper: Wrapper });

    // Find the disconnect handler and invoke it with client-initiated reason
    const disconnectCall = mockOn.mock.calls.find((call) => call[0] === 'disconnect');
    const disconnectHandler = disconnectCall![1];
    disconnectHandler('io client disconnect');

    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('logs a warning for unexpected disconnect reasons', () => {
    mockUseSession.mockReturnValue({
      data: { user: { id: 'user-1', organizationId: 'org-1' } },
    });
    const { Wrapper } = createWrapper();
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation();

    renderHook(() => useRealtime(), { wrapper: Wrapper });

    const disconnectCall = mockOn.mock.calls.find((call) => call[0] === 'disconnect');
    const disconnectHandler = disconnectCall![1];
    disconnectHandler('transport close');

    expect(warnSpy).toHaveBeenCalledWith('[Realtime] WebSocket disconnected:', 'transport close');
    warnSpy.mockRestore();
  });

  it('disconnects the socket on cleanup', () => {
    mockUseSession.mockReturnValue({
      data: { user: { id: 'user-1', organizationId: 'org-1' } },
    });
    const { Wrapper } = createWrapper();

    const { unmount } = renderHook(() => useRealtime(), { wrapper: Wrapper });

    unmount();

    expect(mockDisconnect).toHaveBeenCalled();
  });

  it('invalidates correct query keys on entity events', () => {
    mockUseSession.mockReturnValue({
      data: { user: { id: 'user-1', organizationId: 'org-1' } },
    });
    const { Wrapper, queryClient } = createWrapper();
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

    renderHook(() => useRealtime(), { wrapper: Wrapper });

    // Find the entity-event handler and invoke it
    const entityEventCall = mockOn.mock.calls.find((call) => call[0] === 'entity-event');
    const entityEventHandler = entityEventCall![1];

    act(() => {
      entityEventHandler({
        type: 'CREATED',
        entityType: 'invoice',
        entityId: 'inv-1',
        organizationId: 'org-1',
        timestamp: new Date().toISOString(),
      });
    });

    // Should invalidate 'invoices' and 'dashboard' (invoice is a financial entity)
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['invoices'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['dashboard'] });
  });

  it('invalidates notifications on notification event', () => {
    mockUseSession.mockReturnValue({
      data: { user: { id: 'user-1', organizationId: 'org-1' } },
    });
    const { Wrapper, queryClient } = createWrapper();
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

    renderHook(() => useRealtime(), { wrapper: Wrapper });

    const notificationCall = mockOn.mock.calls.find((call) => call[0] === 'notification');
    const notificationHandler = notificationCall![1];

    act(() => {
      notificationHandler();
    });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['notifications'] });
  });
});
