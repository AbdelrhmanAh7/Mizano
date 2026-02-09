'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { useAllOrganizationSettings, useUpdateAISettings } from '@/lib/hooks/use-all-settings';
import { ArrowLeft, Brain, Save } from 'lucide-react';
import Link from 'next/link';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';

interface FormData {
  aiCategorizationEnabled: boolean;
  aiReconciliationEnabled: boolean;
  aiOcrEnabled: boolean;
  aiForecastingEnabled: boolean;
  aiAnomalyEnabled: boolean;
  aiLeadScoringEnabled: boolean;
  aiRetrainingFrequency: string;
  anomalySensitivity: number;
}

const AI_FEATURES = [
  {
    key: 'aiCategorizationEnabled' as const,
    label: 'Auto-Categorization',
    description: 'Automatically categorize expenses and transactions using ML',
  },
  {
    key: 'aiReconciliationEnabled' as const,
    label: 'Smart Reconciliation',
    description: 'AI-powered matching of bank transactions to invoices/bills',
  },
  {
    key: 'aiOcrEnabled' as const,
    label: 'OCR Document Scanning',
    description: 'Extract data from receipts and invoices using computer vision',
  },
  {
    key: 'aiForecastingEnabled' as const,
    label: 'Cash Flow Forecasting',
    description: 'Predict future cash flows using historical data patterns',
  },
  {
    key: 'aiAnomalyEnabled' as const,
    label: 'Anomaly Detection',
    description: 'Flag unusual transactions or patterns for review',
  },
  {
    key: 'aiLeadScoringEnabled' as const,
    label: 'Lead Scoring',
    description: 'Score CRM leads based on engagement and conversion likelihood',
  },
];

export default function AISettingsPage() {
  const { data: settings, isLoading } = useAllOrganizationSettings();
  const updateAI = useUpdateAISettings();

  const form = useForm<FormData>({
    defaultValues: {
      aiCategorizationEnabled: true,
      aiReconciliationEnabled: true,
      aiOcrEnabled: true,
      aiForecastingEnabled: true,
      aiAnomalyEnabled: true,
      aiLeadScoringEnabled: true,
      aiRetrainingFrequency: 'weekly',
      anomalySensitivity: 50,
    },
  });

  useEffect(() => {
    if (settings?.ai) {
      form.reset({
        aiCategorizationEnabled: settings.ai.aiCategorizationEnabled ?? true,
        aiReconciliationEnabled: settings.ai.aiReconciliationEnabled ?? true,
        aiOcrEnabled: settings.ai.aiOcrEnabled ?? true,
        aiForecastingEnabled: settings.ai.aiForecastingEnabled ?? true,
        aiAnomalyEnabled: settings.ai.aiAnomalyEnabled ?? true,
        aiLeadScoringEnabled: settings.ai.aiLeadScoringEnabled ?? true,
        aiRetrainingFrequency: settings.ai.aiRetrainingFrequency || 'weekly',
        anomalySensitivity: settings.ai.anomalySensitivity ?? 50,
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
        <Button variant="ghost" size="icon" asChild>
          <Link href="/settings">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">AI Features</h1>
          <p className="text-muted-foreground text-sm">
            Toggle AI-powered features and configure model parameters
          </p>
        </div>
      </div>

      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {/* Feature Toggles */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Brain className="h-5 w-5" />
              AI Feature Toggles
            </CardTitle>
            <CardDescription>Enable or disable individual AI capabilities</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1">
            {AI_FEATURES.map((feature) => (
              <div
                key={feature.key}
                className="flex items-center justify-between rounded-lg border p-4"
              >
                <div>
                  <Label className="text-sm font-medium">{feature.label}</Label>
                  <p className="text-xs text-muted-foreground">{feature.description}</p>
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
            <CardTitle>Model Parameters</CardTitle>
            <CardDescription>Configure how AI models learn and detect anomalies</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label>Retraining Frequency</Label>
              <Select
                value={form.watch('aiRetrainingFrequency')}
                onValueChange={(v) =>
                  form.setValue('aiRetrainingFrequency', v, { shouldDirty: true })
                }
              >
                <SelectTrigger className="max-w-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="biweekly">Every 2 Weeks</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                How often AI models retrain on your latest data
              </p>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Anomaly Detection Sensitivity</Label>
                <span className="text-sm font-medium">{form.watch('anomalySensitivity')}%</span>
              </div>
              <Slider
                min={10}
                max={100}
                step={5}
                value={[form.watch('anomalySensitivity')]}
                onValueChange={([v]: number[]) =>
                  form.setValue('anomalySensitivity', v, { shouldDirty: true })
                }
                className="max-w-md"
              />
              <p className="text-xs text-muted-foreground">
                Higher values flag more transactions. Lower values only flag the most unusual ones.
              </p>
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
            {updateAI.isPending ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </form>
    </div>
  );
}
