'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

export interface UseSSEOptions {
  /** Auth token to pass as query param (SSE can't use headers) */
  token?: string | null;
  /** Auto-reconnect on disconnect (default true) */
  autoReconnect?: boolean;
  /** Max reconnection attempts (default 3) */
  maxRetries?: number;
}

export interface UseSSEResult<T> {
  data: T | null;
  error: string | null;
  isConnected: boolean;
  close: () => void;
}

/**
 * Generic hook for consuming Server-Sent Events.
 * Creates an EventSource when `url` is non-null, cleans up on unmount.
 */
export function useSSE<T = unknown>(
  url: string | null,
  options: UseSSEOptions = {},
): UseSSEResult<T> {
  const { token, autoReconnect = true, maxRetries = 3 } = options;
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  const eventSourceRef = useRef<EventSource | null>(null);
  const retriesRef = useRef(0);
  const closedRef = useRef(false);

  const close = useCallback(() => {
    closedRef.current = true;
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setIsConnected(false);
  }, []);

  useEffect(() => {
    if (!url) {
      close();
      return;
    }

    closedRef.current = false;
    retriesRef.current = 0;

    const connect = (): void => {
      if (closedRef.current) return;

      // Build URL with auth token as query param
      const fullUrl = token
        ? `${url}${url.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}`
        : url;

      const es = new EventSource(fullUrl);
      eventSourceRef.current = es;

      es.onopen = () => {
        setIsConnected(true);
        setError(null);
        retriesRef.current = 0;
      };

      es.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data) as T;
          setData(parsed);
        } catch {
          // Non-JSON data — set as-is
          setData(event.data as unknown as T);
        }
      };

      // Listen for typed events (NestJS SSE sends typed events)
      es.addEventListener('progress', (event: Event) => {
        const messageEvent = event as MessageEvent;
        try {
          const parsed = JSON.parse(messageEvent.data) as T;
          setData(parsed);
        } catch {
          setData(messageEvent.data as unknown as T);
        }
      });

      es.onerror = () => {
        es.close();
        eventSourceRef.current = null;
        setIsConnected(false);

        if (!closedRef.current && autoReconnect && retriesRef.current < maxRetries) {
          retriesRef.current++;
          const delay = Math.min(1000 * Math.pow(2, retriesRef.current - 1), 5000);
          setTimeout(connect, delay);
        } else if (!closedRef.current) {
          setError('Connection lost');
        }
      };
    };

    connect();

    return () => {
      closedRef.current = true;
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, [url, token, autoReconnect, maxRetries, close]);

  return { data, error, isConnected, close };
}
