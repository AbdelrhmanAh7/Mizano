'use client';

import {
  CheckCircle2,
  XCircle,
  Clock,
  BarChart3,
  Database,
  MessageSquare,
  TrendingUp,
  AlertTriangle,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  useModelHistory,
  useTrainingStats,
  useTrainingReadiness,
  useRecentFeedback,
} from '@/lib/hooks/use-ai-training-lab';
import { useAiFeedbackStats } from '@/lib/hooks/use-ai-infrastructure';
import type { AiModelConfig } from './all-models-config';

interface ModelDetailDialogProps {
  model: AiModelConfig | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ModelDetailDialog({ model, open, onOpenChange }: ModelDetailDialogProps) {
  const feature = model?.feature;
  const { data: history } = useModelHistory(feature, 10);
  const { data: stats } = useTrainingStats(feature);
  const { data: readiness } = useTrainingReadiness(feature);
  const { data: feedbackStats } = useAiFeedbackStats(feature);
  const { data: recentFeedback } = useRecentFeedback(feature, 20);

  const historyEntries = history?.data || history || [];
  const feedbackEntries = recentFeedback?.data || recentFeedback || [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{model?.name} - Details</DialogTitle>
          <DialogDescription>
            View model training data, version history, and feedback statistics
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="training">Training Data</TabsTrigger>
            <TabsTrigger value="history">Versions</TabsTrigger>
            <TabsTrigger value="feedback">Feedback</TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-4">
            {readiness && (
              <div className="space-y-3">
                <h4 className="text-sm font-medium">Training Readiness</h4>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Samples</span>
                  <span>
                    {readiness.currentSamples} / {readiness.minimumRequired} min
                  </span>
                </div>
                <Progress
                  value={Math.min(
                    100,
                    (readiness.currentSamples / readiness.minimumRequired) * 100,
                  )}
                />
                <Badge variant={readiness.isReady ? 'default' : 'secondary'}>
                  {readiness.isReady ? 'Ready to train' : 'Needs more data'}
                </Badge>
                {readiness.warnings.length > 0 && (
                  <div className="space-y-1">
                    {readiness.warnings.map((w, i) => (
                      <p key={i} className="text-xs text-amber-600 flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" />
                        {w}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            )}

            {Array.isArray(historyEntries) && historyEntries.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium">Active Model</h4>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="p-3 rounded-lg bg-muted">
                    <p className="text-muted-foreground text-xs">Version</p>
                    <p className="font-medium">v{historyEntries[0]?.version}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted">
                    <p className="text-muted-foreground text-xs">Accuracy</p>
                    <p className="font-medium">
                      {historyEntries[0]?.accuracy
                        ? `${(Number(historyEntries[0].accuracy) * 100).toFixed(1)}%`
                        : 'N/A'}
                    </p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted">
                    <p className="text-muted-foreground text-xs">Samples</p>
                    <p className="font-medium">{historyEntries[0]?.sampleCount || 'N/A'}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted">
                    <p className="text-muted-foreground text-xs">Trained</p>
                    <p className="font-medium">
                      {historyEntries[0]?.trainedAt
                        ? new Date(historyEntries[0].trainedAt).toLocaleDateString()
                        : 'Never'}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </TabsContent>

          {/* Training Data Tab */}
          <TabsContent value="training" className="space-y-4">
            {stats && (
              <>
                <div className="grid grid-cols-3 gap-3">
                  <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950 text-center">
                    <p className="text-xs text-muted-foreground">Seed</p>
                    <p className="text-lg font-bold text-blue-600">{stats.bySource.SEED}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-green-50 dark:bg-green-950 text-center">
                    <p className="text-xs text-muted-foreground">User</p>
                    <p className="text-lg font-bold text-green-600">{stats.bySource.USER}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950 text-center">
                    <p className="text-xs text-muted-foreground">Corrections</p>
                    <p className="text-lg font-bold text-amber-600">{stats.bySource.CORRECTION}</p>
                  </div>
                </div>

                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Total records</span>
                  <span className="font-medium">{stats.total}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Unique labels</span>
                  <span className="font-medium">{stats.uniqueLabels}</span>
                </div>

                {stats.labelDistribution && Object.keys(stats.labelDistribution).length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-sm font-medium">Label Distribution</h4>
                    <div className="space-y-1.5 max-h-60 overflow-y-auto">
                      {Object.entries(stats.labelDistribution)
                        .sort(([, a], [, b]) => b - a)
                        .map(([label, count]) => {
                          const pct = stats.total > 0 ? (count / stats.total) * 100 : 0;
                          return (
                            <div key={label} className="space-y-1">
                              <div className="flex items-center justify-between text-xs">
                                <span className="truncate max-w-[200px]" title={label}>
                                  {label}
                                </span>
                                <span className="text-muted-foreground">
                                  {count} ({pct.toFixed(0)}%)
                                </span>
                              </div>
                              <div className="h-2 bg-muted rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-primary rounded-full transition-all"
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                )}
              </>
            )}
          </TabsContent>

          {/* Version History Tab */}
          <TabsContent value="history" className="space-y-4">
            {Array.isArray(historyEntries) && historyEntries.length > 0 ? (
              <div className="space-y-2">
                {historyEntries.map(
                  (entry: {
                    version: number | string;
                    status: string;
                    accuracy?: number | string | null;
                    sampleCount?: number;
                    trainedAt?: string;
                  }) => (
                    <div
                      key={entry.version}
                      className="flex items-center justify-between p-3 rounded-lg border"
                    >
                      <div className="flex items-center gap-3">
                        <Badge variant={entry.status === 'ACTIVE' ? 'default' : 'secondary'}>
                          v{entry.version}
                        </Badge>
                        <div>
                          <p className="text-sm font-medium">
                            {entry.accuracy
                              ? `${(Number(entry.accuracy) * 100).toFixed(1)}% accuracy`
                              : 'No accuracy data'}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {entry.sampleCount} samples
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <Badge variant="outline" className="text-xs">
                          {entry.status}
                        </Badge>
                        <p className="text-xs text-muted-foreground mt-1">
                          {entry.trainedAt ? new Date(entry.trainedAt).toLocaleDateString() : ''}
                        </p>
                      </div>
                    </div>
                  ),
                )}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground text-sm">
                No model versions yet. Train the model to create the first version.
              </div>
            )}
          </TabsContent>

          {/* Feedback Tab */}
          <TabsContent value="feedback" className="space-y-4">
            {feedbackStats?.data && (
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 rounded-lg bg-green-50 dark:bg-green-950 text-center">
                  <CheckCircle2 className="h-4 w-4 text-green-600 mx-auto mb-1" />
                  <p className="text-xs text-muted-foreground">Accepted</p>
                  <p className="text-lg font-bold text-green-600">
                    {feedbackStats.data.accepted || 0}
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950 text-center">
                  <XCircle className="h-4 w-4 text-red-600 mx-auto mb-1" />
                  <p className="text-xs text-muted-foreground">Rejected</p>
                  <p className="text-lg font-bold text-red-600">
                    {feedbackStats.data.rejected || 0}
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950 text-center">
                  <MessageSquare className="h-4 w-4 text-amber-600 mx-auto mb-1" />
                  <p className="text-xs text-muted-foreground">Corrected</p>
                  <p className="text-lg font-bold text-amber-600">
                    {feedbackStats.data.corrected || 0}
                  </p>
                </div>
              </div>
            )}

            {Array.isArray(feedbackEntries) && feedbackEntries.length > 0 ? (
              <div className="space-y-2 max-h-60 overflow-y-auto">
                <h4 className="text-sm font-medium">Recent Feedback</h4>
                {feedbackEntries.map(
                  (entry: {
                    id: string;
                    userAction: string;
                    createdAt: string;
                    userAnswer?: string;
                    aiSuggestion: unknown;
                  }) => (
                    <div key={entry.id} className="p-3 rounded-lg border text-xs space-y-1">
                      <div className="flex items-center justify-between">
                        <Badge
                          variant={
                            entry.userAction === 'ACCEPTED'
                              ? 'default'
                              : entry.userAction === 'REJECTED'
                                ? 'destructive'
                                : 'outline'
                          }
                          className="text-[10px]"
                        >
                          {entry.userAction}
                        </Badge>
                        <span className="text-muted-foreground">
                          {new Date(entry.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                      {entry.userAnswer && (
                        <p className="text-amber-600">Correction: {entry.userAnswer}</p>
                      )}
                      <pre className="text-[10px] text-muted-foreground truncate">
                        {JSON.stringify(entry.aiSuggestion).slice(0, 100)}
                      </pre>
                    </div>
                  ),
                )}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground text-sm">
                No feedback yet for this model.
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
