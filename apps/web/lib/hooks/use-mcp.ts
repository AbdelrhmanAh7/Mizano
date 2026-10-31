'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { mcpApi } from '@/lib/api/mcp';

const KEYS = {
  connections: ['mcp-connections'] as const,
  request: (requestId: string) => ['mcp-oauth', 'request', requestId] as const,
};

/** A pending connection request; never retried (an expired request stays expired). */
export function useMcpAuthRequest(requestId: string) {
  return useQuery({
    queryKey: KEYS.request(requestId),
    queryFn: () => mcpApi.getRequest(requestId),
    retry: false,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
}

export function useApproveMcpRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: mcpApi.approve,
    onSuccess: () => void qc.invalidateQueries({ queryKey: KEYS.connections }),
  });
}

export function useDenyMcpRequest() {
  return useMutation({ mutationFn: mcpApi.deny });
}

export function useMcpConnections() {
  return useQuery({ queryKey: KEYS.connections, queryFn: mcpApi.connections });
}

export function useRevokeMcpConnection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: mcpApi.revoke,
    onSuccess: () => void qc.invalidateQueries({ queryKey: KEYS.connections }),
  });
}
