import api from '@/lib/api';

/** Contract of /integration-settings (Connect to FlowLine). */
export interface IntegrationCatalog {
  apiVersion: string;
  eventTypes: string[];
  scopes: string[];
  encryptionConfigured: boolean;
}

export interface IntegrationApiKey {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  rateLimitPerMinute: number;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

/** Only returned by create: the plaintext key, shown once. */
export interface CreatedIntegrationApiKey extends IntegrationApiKey {
  key: string;
}

export interface WebhookEndpoint {
  id: string;
  name: string;
  url: string;
  secretHint: string;
  eventTypes: string[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export type DeliveryStatus = 'PENDING' | 'DELIVERING' | 'SUCCEEDED' | 'FAILED';

export interface WebhookDelivery {
  id: string;
  eventId: string;
  eventType: string;
  status: DeliveryStatus;
  attempts: number;
  maxAttempts: number;
  nextAttemptAt: string;
  lastStatusCode: number | null;
  lastError: string | null;
  deliveredAt: string | null;
  createdAt: string;
  endpoint: { id: string; name: string };
}

export interface TestDeliveryResult {
  id: string;
  eventId: string;
  status: DeliveryStatus;
  attempts: number;
  lastStatusCode: number | null;
  lastError: string | null;
}

/** Unwraps an optional `{ data }` envelope. */
export function unwrap<T>(body: unknown): T {
  if (body && typeof body === 'object' && !Array.isArray(body) && 'data' in body) {
    return (body as { data: T }).data;
  }
  return body as T;
}

const base = '/integration-settings';

export const integrationsApi = {
  catalog: async (): Promise<IntegrationCatalog> =>
    unwrap<IntegrationCatalog>((await api.get(`${base}/catalog`)).data),
  listKeys: async (): Promise<IntegrationApiKey[]> =>
    unwrap<IntegrationApiKey[]>((await api.get(`${base}/api-keys`)).data),
  createKey: async (input: { name: string; scopes: string[] }): Promise<CreatedIntegrationApiKey> =>
    unwrap<CreatedIntegrationApiKey>((await api.post(`${base}/api-keys`, input)).data),
  revokeKey: async (id: string): Promise<IntegrationApiKey> =>
    unwrap<IntegrationApiKey>((await api.post(`${base}/api-keys/${id}/revoke`)).data),
  listWebhooks: async (): Promise<WebhookEndpoint[]> =>
    unwrap<WebhookEndpoint[]>((await api.get(`${base}/webhooks`)).data),
  createWebhook: async (input: {
    name: string;
    url: string;
    secret: string;
    eventTypes: string[];
  }): Promise<WebhookEndpoint> =>
    unwrap<WebhookEndpoint>((await api.post(`${base}/webhooks`, input)).data),
  updateWebhook: async (
    id: string,
    input: Partial<{
      name: string;
      url: string;
      secret: string;
      eventTypes: string[];
      isActive: boolean;
    }>,
  ): Promise<WebhookEndpoint> =>
    unwrap<WebhookEndpoint>((await api.patch(`${base}/webhooks/${id}`, input)).data),
  deleteWebhook: async (id: string): Promise<void> => {
    await api.delete(`${base}/webhooks/${id}`);
  },
  /** Announce invoices that were already overdue when the webhook subscribed (next scan). */
  sendOverdueBacklog: async (id: string): Promise<WebhookEndpoint> =>
    unwrap<WebhookEndpoint>((await api.post(`${base}/webhooks/${id}/overdue-backlog`)).data),
  testWebhook: async (id: string): Promise<TestDeliveryResult> =>
    unwrap<TestDeliveryResult>((await api.post(`${base}/webhooks/${id}/test`)).data),
  listDeliveries: async (params?: {
    endpointId?: string;
    limit?: number;
  }): Promise<WebhookDelivery[]> =>
    unwrap<WebhookDelivery[]>((await api.get(`${base}/deliveries`, { params })).data),
  redeliver: async (id: string): Promise<void> => {
    await api.post(`${base}/deliveries/${id}/redeliver`);
  },
};

/**
 * The address FlowLine calls. NEXT_PUBLIC_INTEGRATIONS_BASE_URL wins (set it to the public
 * HTTPS address, e.g. the Cloudflare tunnel); otherwise it is derived from the API URL.
 */
export function integrationsBaseUrl(origin?: string): string {
  const explicit = process.env.NEXT_PUBLIC_INTEGRATIONS_BASE_URL;
  if (explicit) return explicit.replace(/\/+$/, '');
  const apiUrl = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:6001/api').replace(
    /\/+$/,
    '',
  );
  const withApi = /\/api$/.test(apiUrl) ? apiUrl : `${apiUrl}/api`;
  const absolute = /^https?:\/\//.test(withApi) ? withApi : `${origin ?? ''}${withApi}`;
  return `${absolute}/integrations/v1`;
}
