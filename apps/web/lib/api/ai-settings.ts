import api from '@/lib/api';
import { unwrap } from '@/lib/api/integrations';

/** Contract of /ai-settings: the organization's own AI account (never carries the key). */
export const AI_PROVIDERS = ['anthropic', 'openai', 'gemini', 'openrouter', 'ollama'] as const;
export type AiProvider = (typeof AI_PROVIDERS)[number];
export const AI_FEATURES = ['documents', 'categorization', 'summary'] as const;
export type AiFeature = (typeof AI_FEATURES)[number];

export interface AiSettingsView {
  provider: AiProvider | 'none';
  model: string | null;
  keyHint: string | null;
  keySource: 'api_key' | 'openrouter_oauth' | null;
  features: AiFeature[];
  activeFeatures: AiFeature[];
  monthlyLimitUsd: string;
  spentThisMonthUsd: string;
  consent: { at: string; byId: string | null; provider: string } | null;
  connectedAt: string | null;
  verifiedAt: string | null;
  availableProviders: AiProvider[];
  encryptionConfigured: boolean;
}

export interface AiModel {
  id: string;
  name: string;
  pricePerMtok?: [string, string];
}

export interface AiUsage {
  since: string;
  byFeature: Array<{
    feature: string;
    calls: number;
    inputTokens: number;
    outputTokens: number;
    costUsd: string;
  }>;
}

export interface MonthlySummary {
  month: string;
  en: string;
  ar: string;
  provider: string;
  model: string;
  generatedAt: string;
}

const base = '/ai-settings';

export const aiSettingsApi = {
  get: async (): Promise<AiSettingsView> => unwrap((await api.get(base)).data),
  features: async (): Promise<{ activeFeatures: AiFeature[] }> =>
    unwrap((await api.get(`${base}/features`)).data),
  usage: async (): Promise<AiUsage> => unwrap((await api.get(`${base}/usage`)).data),
  models: async (): Promise<AiModel[]> => unwrap((await api.get(`${base}/models`)).data),
  connect: async (input: {
    provider: AiProvider;
    apiKey?: string;
  }): Promise<{ settings: AiSettingsView; models: AiModel[] }> =>
    unwrap((await api.post(`${base}/connect`, input)).data),
  update: async (
    input: Partial<{ model: string; monthlyLimitUsd: string; features: AiFeature[] }>,
  ): Promise<AiSettingsView> => unwrap((await api.patch(base, input)).data),
  consent: async (provider: AiProvider): Promise<AiSettingsView> =>
    unwrap((await api.post(`${base}/consent`, { provider, accepted: true })).data),
  revoke: async (): Promise<AiSettingsView> => unwrap((await api.post(`${base}/revoke`)).data),
  test: async (): Promise<{ ok: boolean; model: string; latencyMs: number }> =>
    unwrap((await api.post(`${base}/test`)).data),
  openRouterStart: async (callbackUrl: string): Promise<{ authUrl: string }> =>
    unwrap((await api.post(`${base}/openrouter/start`, { callbackUrl })).data),
  openRouterComplete: async (input: { state: string; code: string }): Promise<AiSettingsView> =>
    unwrap((await api.post(`${base}/openrouter/complete`, input)).data),
  getSummary: async (month: string): Promise<MonthlySummary | null> =>
    unwrap((await api.get('/reports/summary', { params: { month } })).data),
  writeSummary: async (month: string): Promise<MonthlySummary> =>
    unwrap((await api.post('/reports/summary', { month })).data),
};

/** Where each provider issues API keys (a personal chat subscription cannot power Mizano). */
export const PROVIDER_KEY_URLS: Record<Exclude<AiProvider, 'ollama'>, string> = {
  anthropic: 'https://console.anthropic.com/settings/keys',
  openai: 'https://platform.openai.com/api-keys',
  gemini: 'https://aistudio.google.com/apikey',
  openrouter: 'https://openrouter.ai/settings/keys',
};
