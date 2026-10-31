'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { integrationsApi } from '@/lib/api/integrations';

const KEYS = {
  catalog: ['integrations', 'catalog'] as const,
  keys: ['integrations', 'api-keys'] as const,
  webhooks: ['integrations', 'webhooks'] as const,
  deliveries: ['integrations', 'deliveries'] as const,
};

export function useIntegrationCatalog() {
  return useQuery({ queryKey: KEYS.catalog, queryFn: integrationsApi.catalog, staleTime: 300_000 });
}

export function useIntegrationKeys() {
  return useQuery({ queryKey: KEYS.keys, queryFn: integrationsApi.listKeys });
}

export function useWebhookEndpoints() {
  return useQuery({ queryKey: KEYS.webhooks, queryFn: integrationsApi.listWebhooks });
}

/** Refreshes while something is still queued or retrying. */
export function useWebhookDeliveries() {
  return useQuery({
    queryKey: KEYS.deliveries,
    queryFn: () => integrationsApi.listDeliveries({ limit: 25 }),
    refetchInterval: (query) =>
      query.state.data?.some((d) => d.status === 'PENDING' || d.status === 'DELIVERING')
        ? 5000
        : false,
  });
}

export function useCreateIntegrationKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: integrationsApi.createKey,
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.keys }),
  });
}

export function useRevokeIntegrationKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: integrationsApi.revokeKey,
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.keys }),
  });
}

export function useCreateWebhookEndpoint() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: integrationsApi.createWebhook,
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.webhooks }),
  });
}

export function useUpdateWebhookEndpoint() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; input: Parameters<typeof integrationsApi.updateWebhook>[1] }) =>
      integrationsApi.updateWebhook(v.id, v.input),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.webhooks }),
  });
}

export function useDeleteWebhookEndpoint() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: integrationsApi.deleteWebhook,
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.webhooks }),
  });
}

export function useTestWebhookEndpoint() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: integrationsApi.testWebhook,
    onSettled: () => qc.invalidateQueries({ queryKey: KEYS.deliveries }),
  });
}

export function useSendOverdueBacklog() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: integrationsApi.sendOverdueBacklog,
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.webhooks }),
  });
}

export function useRedeliverWebhook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: integrationsApi.redeliver,
    onSettled: () => qc.invalidateQueries({ queryKey: KEYS.deliveries }),
  });
}
