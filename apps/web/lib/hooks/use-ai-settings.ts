'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { aiSettingsApi, type AiFeature, type AiSettingsView } from '@/lib/api/ai-settings';

const KEYS = {
  settings: ['ai-settings'] as const,
  features: ['ai-settings', 'features'] as const,
  usage: ['ai-settings', 'usage'] as const,
  models: ['ai-settings', 'models'] as const,
  summary: (month: string) => ['reports', 'summary', month] as const,
};

export function useAiSettings() {
  return useQuery({ queryKey: KEYS.settings, queryFn: aiSettingsApi.get });
}

export function useAiUsage(enabled: boolean) {
  return useQuery({ queryKey: KEYS.usage, queryFn: aiSettingsApi.usage, enabled });
}

export function useAiModels(enabled: boolean) {
  return useQuery({
    queryKey: KEYS.models,
    queryFn: aiSettingsApi.models,
    enabled,
    staleTime: 300_000,
  });
}

/** Whether an AI feature runs for this organization; false while loading or on error. */
export function useAiFeature(feature: AiFeature): { active: boolean; isLoading: boolean } {
  const query = useQuery({
    queryKey: KEYS.features,
    queryFn: aiSettingsApi.features,
    staleTime: 60_000,
  });
  return {
    active: query.data?.activeFeatures.includes(feature) ?? false,
    isLoading: query.isLoading,
  };
}

/** Every settings change refreshes the status, the active features and the model list. */
function useSettingsMutation<TInput>(fn: (input: TInput) => Promise<AiSettingsView>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (view) => {
      qc.setQueryData(KEYS.settings, view);
      void qc.invalidateQueries({ queryKey: KEYS.settings });
    },
  });
}

export function useConnectAi() {
  return useSettingsMutation(async (input: Parameters<typeof aiSettingsApi.connect>[0]) => {
    const { settings } = await aiSettingsApi.connect(input);
    return settings;
  });
}

export function useUpdateAi() {
  return useSettingsMutation(aiSettingsApi.update);
}

/** Choosing a model runs a real test call; only a passing model is saved. */
export function useChooseAiModel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (model: string) => aiSettingsApi.chooseModel(model),
    onSuccess: (result) => {
      if (result.ok) qc.setQueryData(KEYS.settings, result.settings);
      void qc.invalidateQueries({ queryKey: KEYS.settings });
    },
  });
}

export function useConsentAi() {
  return useSettingsMutation(aiSettingsApi.consent);
}

export function useRevokeAi() {
  return useSettingsMutation(() => aiSettingsApi.revoke());
}

export function useCompleteOpenRouter() {
  return useSettingsMutation(aiSettingsApi.openRouterComplete);
}

export function useStartOpenRouter() {
  return useMutation({ mutationFn: aiSettingsApi.openRouterStart });
}

export function useTestAi() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => aiSettingsApi.test(),
    // A test changes whether the connection is verified and what the last error is.
    onSettled: () => void qc.invalidateQueries({ queryKey: KEYS.settings }),
  });
}

export function useMonthlySummary(month: string, enabled: boolean) {
  return useQuery({
    queryKey: KEYS.summary(month),
    queryFn: () => aiSettingsApi.getSummary(month),
    enabled,
  });
}

export function useWriteMonthlySummary(month: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => aiSettingsApi.writeSummary(month),
    onSuccess: (summary) => qc.setQueryData(KEYS.summary(month), summary),
  });
}
