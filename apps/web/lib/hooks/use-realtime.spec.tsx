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

/** Helper: find the handler registered for a given socket event name. */
function getHandler(eventName: string): ((...args: unknown[]) => void) | undefined {
  const call = mockOn.mock.calls.find((c) => c[0] === eventName);
  return call?.[1] as ((...args: unknown[]) => void) | undefined;
}

beforeEach(() => {
  mockOn.mockReset();
  mockEmit.mockReset();
  mockDisconnect.mockReset();
  mockUseSession.mockReset();
  (io as jest.Mock).mockClear();
});

describe('useRealtime', () => {
  // ---------------------------------------------------------------------------
  // Connection lifecycle
  // ---------------------------------------------------------------------------

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

  it('creates a socket with reconnection config when session exists', () => {
    mockUseSession.mockReturnValue({
      data: { user: { id: 'user-1', organizationId: 'org-1' } },
    });
    const { Wrapper } = createWrapper();

    renderHook(() => useRealtime(), { wrapper: Wrapper });

    expect(io).toHaveBeenCalledWith(expect.stringContaining('/events'), {
      transports: ['websocket'],
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 30000,
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

    getHandler('connect')!();

    expect(mockEmit).toHaveBeenCalledWith('join-org', 'org-1');
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

  // ---------------------------------------------------------------------------
  // Disconnect reason handling
  // ---------------------------------------------------------------------------

  it('does not log anything for client-initiated disconnect', () => {
    mockUseSession.mockReturnValue({
      data: { user: { id: 'user-1', organizationId: 'org-1' } },
    });
    const { Wrapper } = createWrapper();
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
    const debugSpy = jest.spyOn(console, 'debug').mockImplementation();

    renderHook(() => useRealtime(), { wrapper: Wrapper });

    getHandler('disconnect')!('io client disconnect');

    expect(warnSpy).not.toHaveBeenCalled();
    expect(debugSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
    debugSpy.mockRestore();
  });

  it.each(['transport close', 'transport error', 'ping timeout'])(
    'logs debug (not warn) for auto-recoverable reason: %s',
    (reason) => {
      mockUseSession.mockReturnValue({
        data: { user: { id: 'user-1', organizationId: 'org-1' } },
      });
      const { Wrapper } = createWrapper();
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
      const debugSpy = jest.spyOn(console, 'debug').mockImplementation();

      renderHook(() => useRealtime(), { wrapper: Wrapper });

      getHandler('disconnect')!(reason);

      expect(warnSpy).not.toHaveBeenCalled();
      expect(debugSpy).toHaveBeenCalledWith(
        '[Realtime] WebSocket disconnected (will reconnect):',
        reason,
      );
      warnSpy.mockRestore();
      debugSpy.mockRestore();
    },
  );

  it('warns for truly unexpected disconnect reasons (e.g. io server disconnect)', () => {
    mockUseSession.mockReturnValue({
      data: { user: { id: 'user-1', organizationId: 'org-1' } },
    });
    const { Wrapper } = createWrapper();
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
    const debugSpy = jest.spyOn(console, 'debug').mockImplementation();

    renderHook(() => useRealtime(), { wrapper: Wrapper });

    getHandler('disconnect')!('io server disconnect');

    expect(warnSpy).toHaveBeenCalledWith(
      '[Realtime] WebSocket disconnected:',
      'io server disconnect',
    );
    expect(debugSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
    debugSpy.mockRestore();
  });

  // ---------------------------------------------------------------------------
  // Cache invalidation
  // ---------------------------------------------------------------------------

  it('invalidates correct query keys on entity events', () => {
    mockUseSession.mockReturnValue({
      data: { user: { id: 'user-1', organizationId: 'org-1' } },
    });
    const { Wrapper, queryClient } = createWrapper();
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

    renderHook(() => useRealtime(), { wrapper: Wrapper });

    act(() => {
      getHandler('entity-event')!({
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

  it('does not invalidate dashboard for non-financial entities', () => {
    mockUseSession.mockReturnValue({
      data: { user: { id: 'user-1', organizationId: 'org-1' } },
    });
    const { Wrapper, queryClient } = createWrapper();
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

    renderHook(() => useRealtime(), { wrapper: Wrapper });

    act(() => {
      getHandler('entity-event')!({
        type: 'UPDATED',
        entityType: 'lead',
        entityId: 'lead-1',
        organizationId: 'org-1',
        timestamp: new Date().toISOString(),
      });
    });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['leads'] });
    expect(invalidateSpy).not.toHaveBeenCalledWith({ queryKey: ['dashboard'] });
  });

  it('ignores entity events with unknown entity types', () => {
    mockUseSession.mockReturnValue({
      data: { user: { id: 'user-1', organizationId: 'org-1' } },
    });
    const { Wrapper, queryClient } = createWrapper();
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

    renderHook(() => useRealtime(), { wrapper: Wrapper });

    act(() => {
      getHandler('entity-event')!({
        type: 'CREATED',
        entityType: 'unknownEntity',
        entityId: 'x-1',
        organizationId: 'org-1',
        timestamp: new Date().toISOString(),
      });
    });

    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  it('invalidates notifications on notification event', () => {
    mockUseSession.mockReturnValue({
      data: { user: { id: 'user-1', organizationId: 'org-1' } },
    });
    const { Wrapper, queryClient } = createWrapper();
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

    renderHook(() => useRealtime(), { wrapper: Wrapper });

    act(() => {
      getHandler('notification')!();
    });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['notifications'] });
  });
});
