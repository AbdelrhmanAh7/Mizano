'use client';

import { useState } from 'react';
import {
  CheckCircle2,
  XCircle,
  MessageSquare,
  RefreshCw,
  Loader2,
  BarChart3,
  ArrowRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  useRecentFeedback,
  useFeedbackTrends,
  useTriggerRetraining,
} from '@/lib/hooks/use-ai-training-lab';
import { useAiFeedbackStats } from '@/lib/hooks/use-ai-infrastructure';
import type { AiFeature } from '@/lib/hooks/use-ai-infrastructure';
import { AI_MODELS } from './all-models-config';

// Retraining thresholds (matching backend)
const RETRAINING_THRESHOLDS: Partial<Record<AiFeature, number>> = {
  CATEGORIZATION: 50,
  RECONCILIATION: 30,
  OCR_LAYOUT: 20,
  DEMAND_FORECAST: 100,
  LEAD_SCORING: 20,
  ANOMALY: 50,
  REORDER: 50,
  PAYMENT_PREDICTION: 30,
  CASH_FLOW: 50,
  PATTERN_DETECTION: 30,
  CHURN_PREDICTION: 30,
  CLV_ANALYSIS: 50,
  CROSS_SELL: 40,
  DYNAMIC_PRICING: 50,
  PIPELINE_FORECAST: 30,
  FRAUD_DETECTION: 20,
  COMPLIANCE_MONITORING: 30,
  AUDIT_RISK: 30,
  DOCUMENT_CLASSIFICATION: 30,
  SENTIMENT_ANALYSIS: 50,
  ENTITY_EXTRACTION: 30,
  CONTRACT_ANALYSIS: 50,
  EMPLOYEE_ATTRITION: 30,
  COMPENSATION_BENCHMARK: 50,
  SKILLS_GAP: 50,
  QUALITY_PREDICTION: 40,
  PREDICTIVE_MAINTENANCE: 40,
  WORKFORCE_SCHEDULING: 50,
  ROUTE_OPTIMIZATION: 100,
  RESOURCE_OPTIMIZATION: 100,
  CHATBOT: 50,
  KNOWLEDGE_ASSISTANT: 50,
};

export function FeedbackCorrectionPanel() {
  const [selectedFeature, setSelectedFeature] = useState<AiFeature>('CATEGORIZATION');

  const { data: feedbackStats, isLoading: loadingStats } = useAiFeedbackStats(selectedFeature);
  const { data: recentFeedback, isLoading: loadingFeedback } = useRecentFeedback(
    selectedFeature,
    30,
  );
  const { data: trends } = useFeedbackTrends(selectedFeature, 30);
  const retrain = useTriggerRetraining();

  const stats = feedbackStats?.data || feedbackStats;
  const feedbackEntries = recentFeedback?.data || recentFeedback || [];
  const trendEntries = trends?.data || trends || [];
  const threshold = RETRAINING_THRESHOLDS[selectedFeature] || 50;
  const correctionCount = stats?.corrected || 0;
  const thresholdProgress = Math.min(100, (correctionCount / threshold) * 100);

  return (
    <div className="space-y-4">
      {/* Feature Selector */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Feedback & Corrections</h2>
          <p className="text-sm text-muted-foreground">
            Review AI predictions and submit corrections to improve model accuracy
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={selectedFeature} onValueChange={(v) => setSelectedFeature(v as AiFeature)}>
            <SelectTrigger className="w-[250px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {AI_MODELS.map((model) => (
                <SelectItem key={model.feature} value={model.feature}>
                  {model.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            variant="outline"
            onClick={() => retrain.mutate(selectedFeature)}
            disabled={retrain.isPending}
          >
            {retrain.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Retrain Now
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 dark:bg-green-950 rounded-lg">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Accepted</p>
                <p className="text-2xl font-bold text-green-600">{stats?.accepted || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-100 dark:bg-red-950 rounded-lg">
                <XCircle className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Rejected</p>
                <p className="text-2xl font-bold text-red-600">{stats?.rejected || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-100 dark:bg-amber-950 rounded-lg">
                <MessageSquare className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Corrected</p>
                <p className="text-2xl font-bold text-amber-600">{correctionCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-950 rounded-lg">
                <BarChart3 className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total</p>
                <p className="text-2xl font-bold">{stats?.total || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Retraining Threshold */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Retraining Threshold</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Corrections since last training</span>
            <span className="font-medium">
              {correctionCount} / {threshold}
            </span>
          </div>
          <Progress value={thresholdProgress} />
          <p className="text-xs text-muted-foreground">
            {thresholdProgress >= 100
              ? 'Threshold reached! Retraining is recommended.'
              : `${threshold - correctionCount} more corrections needed before automatic retraining.`}
          </p>
        </CardContent>
      </Card>

      {/* Feedback Trends */}
      {Array.isArray(trendEntries) && trendEntries.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">30-Day Feedback Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-0.5 h-24">
              {trendEntries.map(
                (
                  entry: { accepted?: number; rejected?: number; corrected?: number; date: string },
                  idx: number,
                ) => {
                  const total =
                    (entry.accepted || 0) + (entry.rejected || 0) + (entry.corrected || 0);
                  const maxVal = Math.max(
                    ...trendEntries.map(
                      (e: { accepted?: number; rejected?: number; corrected?: number }) =>
                        (e.accepted || 0) + (e.rejected || 0) + (e.corrected || 0),
                    ),
                    1,
                  );
                  const height = total > 0 ? (total / maxVal) * 100 : 0;
                  return (
                    <div
                      key={idx}
                      className="flex-1 bg-primary/20 hover:bg-primary/40 rounded-t transition-colors"
                      style={{ height: `${Math.max(2, height)}%` }}
                      title={`${entry.date}: ${total} feedback`}
                    />
                  );
                },
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent Feedback List */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Recent Feedback</CardTitle>
        </CardHeader>
        <CardContent>
          {loadingFeedback ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : Array.isArray(feedbackEntries) && feedbackEntries.length > 0 ? (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {feedbackEntries.map(
                (entry: {
                  id: string;
                  userAction: string;
                  aiSuggestion: unknown;
                  userAnswer?: string;
                  createdAt: string;
                }) => (
                  <div
                    key={entry.id}
                    className="flex items-start gap-3 p-3 rounded-lg border text-sm"
                  >
                    <Badge
                      variant={
                        entry.userAction === 'ACCEPTED'
                          ? 'default'
                          : entry.userAction === 'REJECTED'
                            ? 'destructive'
                            : 'outline'
                      }
                      className="text-[10px] mt-0.5 shrink-0"
                    >
                      {entry.userAction}
                    </Badge>
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>AI suggested:</span>
                        <code className="text-[10px] bg-muted px-1 rounded truncate max-w-[200px] inline-block">
                          {typeof entry.aiSuggestion === 'object'
                            ? JSON.stringify(entry.aiSuggestion).slice(0, 60)
                            : String(entry.aiSuggestion).slice(0, 60)}
                        </code>
                      </div>
                      {entry.userAction === 'CORRECTED' && entry.userAnswer && (
                        <div className="flex items-center gap-1 text-xs text-amber-600">
                          <ArrowRight className="h-3 w-3" />
                          Corrected to: <strong>{entry.userAnswer}</strong>
                        </div>
                      )}
                    </div>
                    <span className="text-[10px] text-muted-foreground shrink-0">
                      {new Date(entry.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                ),
              )}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground text-sm">
              No feedback submitted yet for{' '}
              {AI_MODELS.find((m) => m.feature === selectedFeature)?.name || selectedFeature}.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Retrain result */}
      {retrain.isSuccess && (
        <div className="rounded-lg bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 p-3 text-sm text-green-700 dark:text-green-300">
          Retraining check complete.{' '}
          {retrain.data?.data?.message || retrain.data?.message || 'Done.'}
        </div>
      )}
    </div>
  );
}
