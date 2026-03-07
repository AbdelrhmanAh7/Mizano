'use client';

import { useState } from 'react';
import {
  Play,
  RefreshCw,
  Loader2,
  CheckCircle2,
  XCircle,
  Sparkles,
  Info,
  Database,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useTrainModel } from '@/lib/hooks/use-ai-training-lab';
import type { AiModelConfig } from './all-models-config';
import type { TrainingLabModelItem } from '@/lib/hooks/use-ai-training-lab';

interface ModelCardProps {
  config: AiModelConfig;
  dashboardData?: TrainingLabModelItem;
  onGenerateClick: () => void;
  onDetailClick: () => void;
}

const COLOR_MAP: Record<string, { bar: string; bg: string }> = {
  blue: { bar: 'bg-blue-500', bg: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300' },
  orange: {
    bar: 'bg-orange-500',
    bg: 'bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300',
  },
  red: { bar: 'bg-red-500', bg: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300' },
  green: {
    bar: 'bg-green-500',
    bg: 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300',
  },
  yellow: {
    bar: 'bg-yellow-500',
    bg: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300',
  },
  purple: {
    bar: 'bg-purple-500',
    bg: 'bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300',
  },
  pink: { bar: 'bg-pink-500', bg: 'bg-pink-100 text-pink-700 dark:bg-pink-950 dark:text-pink-300' },
  teal: { bar: 'bg-teal-500', bg: 'bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300' },
  amber: {
    bar: 'bg-amber-500',
    bg: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  },
  emerald: {
    bar: 'bg-emerald-500',
    bg: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  },
  violet: {
    bar: 'bg-violet-500',
    bg: 'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300',
  },
  slate: {
    bar: 'bg-slate-500',
    bg: 'bg-slate-100 text-slate-700 dark:bg-slate-950 dark:text-slate-300',
  },
  cyan: { bar: 'bg-cyan-500', bg: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300' },
};

export function ModelCard({
  config,
  dashboardData,
  onGenerateClick,
  onDetailClick,
}: ModelCardProps) {
  const trainModel = useTrainModel();
  const [trainResult, setTrainResult] = useState<{
    success: boolean;
    data?: unknown;
    error?: string;
    duration?: number;
  } | null>(null);

  const colors = COLOR_MAP[config.color] || COLOR_MAP.blue;
  const isAlgorithmic = !config.hasDirectTrain;
  const hasModel = dashboardData?.hasActiveModel;
  const accuracy = dashboardData?.accuracy;
  const trainingCount = dashboardData?.trainingDataCount || 0;

  const handleTrain = async () => {
    if (!config.trainEndpoint && !config.feature) return;
    setTrainResult(null);
    const start = Date.now();

    if (config.hasDirectTrain && config.trainEndpoint) {
      trainModel.mutate(config.trainEndpoint, {
        onSuccess: (data) => {
          setTrainResult({ success: true, data, duration: Date.now() - start });
        },
        onError: (err: { response?: { data?: { message?: string } }; message?: string }) => {
          setTrainResult({
            success: false,
            error: err?.response?.data?.message || err.message || 'Training failed',
            duration: Date.now() - start,
          });
        },
      });
    }
  };

  const isTraining = trainModel.isPending;

  return (
    <Card className="overflow-hidden">
      <div className={`h-1 ${colors.bar}`} />
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <CardTitle className="text-sm font-medium">{config.name}</CardTitle>
          <div className="flex items-center gap-1">
            {hasModel && (
              <Badge variant="default" className="text-[10px] px-1.5 py-0">
                v{dashboardData?.activeVersion}
              </Badge>
            )}
            {isAlgorithmic ? (
              <Badge
                variant="outline"
                className="text-[10px] px-1.5 py-0 border-green-500 text-green-600"
              >
                Active
              </Badge>
            ) : hasModel ? (
              <Badge
                variant="outline"
                className="text-[10px] px-1.5 py-0 border-blue-500 text-blue-600"
              >
                Trained
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="text-[10px] px-1.5 py-0 border-yellow-500 text-yellow-600"
              >
                Ready
              </Badge>
            )}
          </div>
        </div>
        <CardDescription className="text-xs line-clamp-2">{config.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Stats row */}
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {accuracy !== null && accuracy !== undefined && (
            <span className="flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3 text-green-500" />
              {(accuracy * 100).toFixed(1)}%
            </span>
          )}
          <span className="flex items-center gap-1">
            <Database className="h-3 w-3" />
            {trainingCount} samples
          </span>
          {dashboardData?.lastTrainedAt && (
            <span
              className="flex items-center gap-1"
              title={new Date(dashboardData.lastTrainedAt).toLocaleString()}
            >
              <RefreshCw className="h-3 w-3" />
              {formatTimeAgo(dashboardData.lastTrainedAt)}
            </span>
          )}
        </div>

        {/* Training data progress */}
        {trainingCount > 0 && (
          <Progress value={Math.min(100, (trainingCount / 100) * 100)} className="h-1" />
        )}

        {/* Action buttons */}
        <div className="flex gap-1.5">
          {config.hasDirectTrain && (
            <Button
              size="sm"
              variant={hasModel ? 'outline' : 'default'}
              className="flex-1 text-xs h-8"
              onClick={handleTrain}
              disabled={isTraining}
            >
              {isTraining ? (
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              ) : hasModel ? (
                <RefreshCw className="mr-1 h-3 w-3" />
              ) : (
                <Play className="mr-1 h-3 w-3" />
              )}
              {isTraining ? 'Training...' : hasModel ? 'Retrain' : 'Train'}
            </Button>
          )}

          {!isAlgorithmic ? (
            <Button
              size="sm"
              variant="outline"
              className="flex-1 text-xs h-8"
              onClick={onGenerateClick}
            >
              <Sparkles className="mr-1 h-3 w-3" />
              Generate
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              className="flex-1 text-xs h-8"
              onClick={onDetailClick}
            >
              <Play className="mr-1 h-3 w-3" />
              Run Analysis
            </Button>
          )}

          <Button size="sm" variant="ghost" className="text-xs h-8 px-2" onClick={onDetailClick}>
            <Info className="h-3 w-3" />
          </Button>
        </div>

        {/* Train result */}
        {trainResult && (
          <div
            className={`p-2 rounded text-xs ${trainResult.success ? 'bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300' : 'bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300'}`}
          >
            {trainResult.success ? (
              <span className="flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" />
                Trained ({trainResult.duration}ms)
              </span>
            ) : (
              <span className="flex items-center gap-1">
                <XCircle className="h-3 w-3" />
                {trainResult.error}
              </span>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
