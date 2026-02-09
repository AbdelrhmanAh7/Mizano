'use client';

import { useRealtime } from '@/lib/hooks/use-realtime';

/**
 * Client component that initializes the WebSocket connection
 * for real-time entity event broadcasting. Wrap your dashboard
 * layout with this provider to enable automatic cache invalidation
 * when other users make changes.
 */
export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  useRealtime();
  return <>{children}</>;
}
