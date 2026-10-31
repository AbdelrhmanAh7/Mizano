import { AsyncLocalStorage } from 'async_hooks';

/**
 * Per-request record of which integration key (if any) is making the call. The middleware opens
 * a store for every /integrations/v1 request and the key guard fills it in, so events written
 * deep inside the sales services can say `source.type = "api_key"`. FlowLine flows use that to
 * ignore changes they made themselves (no event loops).
 */
export interface IntegrationRequestStore {
  apiKeyId?: string;
  apiKeyName?: string;
}

export const integrationRequestContext = new AsyncLocalStorage<IntegrationRequestStore>();

export type EventSource =
  | { type: 'user' }
  | { type: 'system' }
  | { type: 'api_key'; apiKeyId: string; apiKeyName: string };

export function currentEventSource(fallback: 'user' | 'system' = 'user'): EventSource {
  const store = integrationRequestContext.getStore();
  if (store?.apiKeyId) {
    return { type: 'api_key', apiKeyId: store.apiKeyId, apiKeyName: store.apiKeyName ?? '' };
  }
  return { type: fallback };
}
