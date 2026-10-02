'use client';

import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { io, Socket } from 'socket.io-client';
import { getSession, useSession } from 'next-auth/react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:6001/api';
// Strip the /api path to get the base WS URL
const WS_URL = API_BASE.replace(/\/api$/, '');

interface EntityEvent {
  type: 'CREATED' | 'UPDATED' | 'DELETED' | 'STATUS_CHANGED';
  entityType: string;
  entityId: string;
  organizationId: string;
  data?: Record<string, unknown>;
  timestamp: string;
}

/** Map entity types to their React Query cache keys */
const ENTITY_QUERY_KEY_MAP: Record<string, string[]> = {
  invoice: ['invoices'],
  bill: ['bills'],
  payment: ['payments'],
  customer: ['customers'],
  vendor: ['vendors'],
  item: ['items'],
  expense: ['expenses'],
  journal: ['journals'],
  employee: ['employees'],
  project: ['projects'],
  lead: ['leads'],
  deal: ['deals'],
  bankTransaction: ['bank-transactions'],
  bankAccount: ['bank-accounts'],
  quote: ['quotes'],
  creditNote: ['credit-notes'],
  warehouse: ['warehouses'],
  adjustment: ['adjustments'],
  transfer: ['transfers'],
  workOrder: ['work-orders'],
  notification: ['notifications'],
};

const FINANCIAL_ENTITIES = new Set([
  'invoice',
  'bill',
  'payment',
  'expense',
  'journal',
  'creditNote',
]);

/**
 * Socket.IO disconnect reasons that are auto-recoverable.
 * Socket.IO will reconnect automatically for these — no warning needed.
 * Only `io server disconnect` requires manual reconnection (server forcefully
 * kicked the client and auto-reconnect is disabled for that reason).
 */
const AUTO_RECOVERABLE_REASONS = new Set(['transport close', 'transport error', 'ping timeout']);

/**
 * Hook that connects to the WebSocket server and automatically
 * invalidates React Query caches when entity events are received.
 * This enables real-time UI updates across all connected clients.
 */
export function useRealtime() {
  const socketRef = useRef<Socket | null>(null);
  const queryClient = useQueryClient();
  const { data: session } = useSession();

  // Stabilize dependencies to avoid unnecessary reconnects on session object reference changes
  const orgId = session?.user?.organizationId;
  const userId = session?.user?.id;

  useEffect(() => {
    if (!userId) return;

    let disposed = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;

    let reconnectDelay = 1000;
    let recovering = false;

    const socket = io(`${WS_URL}/events`, {
      auth: (cb) => {
        getSession()
          .then((freshSession) => {
            if (!disposed) cb({ token: freshSession?.accessToken });
          })
          .catch(() => {
            if (!disposed) cb({});
          });
      },
      transports: ['polling', 'websocket'],
      upgrade: true,
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 30000,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      if (orgId) {
        socket.emit('join-org', orgId);
      }
    });

    socket.on('entity-event', (event: EntityEvent) => {
      // Invalidate relevant React Query caches
      const queryKeys = ENTITY_QUERY_KEY_MAP[event.entityType];
      if (queryKeys) {
        queryKeys.forEach((key) => {
          queryClient.invalidateQueries({ queryKey: [key] });
        });
      }

      // Also invalidate dashboard data for financial entity changes
      if (FINANCIAL_ENTITIES.has(event.entityType)) {
        queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      }
    });

    socket.on('notification', () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    });

    const scheduleRecovery = () => {
      if (disposed) return;
      reconnectTimer = setTimeout(async () => {
        reconnectTimer = undefined;
        let hasToken = false;
        try {
          hasToken = !!(await getSession())?.accessToken;
        } catch {
          // Retry temporary session failures with backoff.
        }
        if (disposed) return;
        if (hasToken) {
          recovering = false;
          reconnectDelay = 1000;
          socket.connect();
        } else {
          reconnectDelay = Math.min(reconnectDelay * 2, 30000);
          scheduleRecovery();
        }
      }, reconnectDelay);
    };

    socket.on('disconnect', (reason) => {
      if (reason === 'io client disconnect') {
        // Client-initiated cleanup (e.g., unmount) — expected, no log
        return;
      }
      if (AUTO_RECOVERABLE_REASONS.has(reason)) {
        // Socket.IO will auto-reconnect — no action needed
        return;
      }
      if (reason === 'io server disconnect' && !disposed && !recovering) {
        recovering = true;
        scheduleRecovery();
      }
    });

    return () => {
      disposed = true;
      if (reconnectTimer !== undefined) clearTimeout(reconnectTimer);
      socket.disconnect();
      socketRef.current = null;
    };
  }, [orgId, userId, queryClient]);

  return socketRef;
}
