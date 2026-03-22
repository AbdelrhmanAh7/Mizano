'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { useAllOrganizationSettings, useUpdateAISettings } from '@/lib/hooks/use-all-settings';
import { ArrowLeft, Brain, Save } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';

interface FormData {
  aiCategorizationEnabled: boolean;
  aiReconciliationEnabled: boolean;

  aiForecastingEnabled: boolean;
  aiAnomalyEnabled: boolean;
  aiLeadScoringEnabled: boolean;
  anomalySensitivity: number;
}

const AI_FEATURES = [
  { key: 'aiCategorizationEnabled' as const, labelKey: 'categorization' },
  { key: 'aiReconciliationEnabled' as const, labelKey: 'reconciliation' },

  { key: 'aiForecastingEnabled' as const, labelKey: 'forecasting' },
  { key: 'aiAnomalyEnabled' as const, labelKey: 'anomaly' },
  { key: 'aiLeadScoringEnabled' as const, labelKey: 'leadScoring' },
];

export default function AISettingsPage() {
  const t = useTranslations('settings');
  const { data: settings, isLoading } = useAllOrganizationSettings();
  const updateAI = useUpdateAISettings();

  const form = useForm<FormData>({
    defaultValues: {
      aiCategorizationEnabled: true,
      aiReconciliationEnabled: true,

      aiForecastingEnabled: true,
      aiAnomalyEnabled: true,
      aiLeadScoringEnabled: true,
      anomalySensitivity: 3,
    },
  });

  useEffect(() => {
    if (settings?.ai) {
      form.reset({
        aiCategorizationEnabled: settings.ai.aiCategorizationEnabled ?? true,
        aiReconciliationEnabled: settings.ai.aiReconciliationEnabled ?? true,

        aiForecastingEnabled: settings.ai.aiForecastingEnabled ?? true,
        aiAnomalyEnabled: settings.ai.aiAnomalyEnabled ?? true,
        aiLeadScoringEnabled: settings.ai.aiLeadScoringEnabled ?? true,
        anomalySensitivity: settings.ai.anomalySensitivity ?? 3,
      });
    }
  }, [settings, form]);

  const onSubmit = (data: FormData) => {
    updateAI.mutate(data);
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="rounded-xl border bg-card p-6 space-y-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild aria-label={t('common.goBack')}>
          <Link href="/settings">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('ai.title')}</h1>
          <p className="text-muted-foreground text-sm">{t('ai.description')}</p>
        </div>
      </div>

      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {/* Feature Toggles */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Brain className="h-5 w-5" />
              {t('ai.featureToggles')}
            </CardTitle>
            <CardDescription>{t('ai.featureTogglesDescription')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1">
            {AI_FEATURES.map((feature) => (
              <div
                key={feature.key}
                className="flex items-center justify-between rounded-lg border p-4"
              >
                <div>
                  <Label className="text-sm font-medium">
                    {t(`ai.features.${feature.labelKey}`)}
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {t(`ai.features.${feature.labelKey}Description`)}
                  </p>
                </div>
                <Switch
                  checked={form.watch(feature.key)}
                  onCheckedChange={(v) => form.setValue(feature.key, v, { shouldDirty: true })}
                />
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Model Parameters */}
        <Card>
          <CardHeader>
            <CardTitle>{t('ai.modelParameters')}</CardTitle>
            <CardDescription>{t('ai.modelParametersDescription')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>{t('ai.anomalySensitivity')}</Label>
                <span className="text-sm font-medium">{form.watch('anomalySensitivity')}</span>
              </div>
              <Slider
                min={2}
                max={4}
                step={1}
                value={[form.watch('anomalySensitivity')]}
                onValueChange={([v]: number[]) =>
                  form.setValue('anomalySensitivity', v, { shouldDirty: true })
                }
                className="max-w-md"
              />
              <p className="text-xs text-muted-foreground">{t('ai.anomalySensitivityHint')}</p>
            </div>
          </CardContent>
        </Card>

        {/* Save */}
        <div className="flex justify-end">
          <Button
            type="submit"
            disabled={updateAI.isPending || !form.formState.isDirty}
            className="gap-2"
          >
            <Save className="h-4 w-4" />
            {updateAI.isPending ? t('common.saving') : t('common.saveChanges')}
          </Button>
        </div>
      </form>
    </div>
  );
}
