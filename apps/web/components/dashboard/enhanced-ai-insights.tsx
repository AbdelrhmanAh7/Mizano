'use client';

import { memo } from 'react';
import {
  AlertCircle,
  TrendingUp,
  Lightbulb,
  Eye,
  Bell,
  Target,
  X,
  ChevronRight,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import {
  useAIInsights,
  useDismissInsight,
  type AIInsight,
  type InsightType,
  type InsightPriority,
} from '@/lib/hooks/use-ai-insights';

const typeConfig: Record<
  InsightType,
  { icon: React.ElementType; color: string; bg: string }
> = {
  ANOMALY: { icon: AlertCircle, color: 'text-red-600', bg: 'bg-red-50 dark:bg-red-950' },
  TREND: { icon: TrendingUp, color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-950' },
  RECOMMENDATION: { icon: Lightbulb, color: 'text-yellow-600', bg: 'bg-yellow-50 dark:bg-yellow-950' },
  FORECAST: { icon: Eye, color: 'text-purple-600', bg: 'bg-purple-50 dark:bg-purple-950' },
  ALERT: { icon: Bell, color: 'text-orange-600', bg: 'bg-orange-50 dark:bg-orange-950' },
  OPPORTUNITY: { icon: Target, color: 'text-green-600', bg: 'bg-green-50 dark:bg-green-950' },
};

const priorityColors: Record<InsightPriority, string> = {
  CRITICAL: 'bg-red-100 text-red-700 border-red-200',
  HIGH: 'bg-orange-100 text-orange-700 border-orange-200',
  MEDIUM: 'bg-blue-100 text-blue-700 border-blue-200',
  LOW: 'bg-gray-100 text-gray-700 border-gray-200',
};

function InsightCard({ insight }: { insight: AIInsight }) {
  const config = typeConfig[insight.type] || typeConfig.ALERT;
  const Icon = config.icon;
  const dismiss = useDismissInsight();

  return (
    <div
      className={cn(
        'flex items-start gap-3 p-3 rounded-lg border transition-colors',
        config.bg,
      )}
    >
      <div className={cn('mt-0.5', config.color)}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <p className="text-sm font-medium truncate">{insight.title}</p>
          <Badge
            variant="outline"
            className={cn('text-[10px] px-1 py-0 shrink-0', priorityColors[insight.priority])}
          >
            {insight.priority}
          </Badge>
          {insight.confidence > 0 && (
            <span className="text-[10px] text-muted-foreground shrink-0">
              {Math.round(insight.confidence * 100)}%
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground line-clamp-2">
          {insight.description}
        </p>
        {insight.recommendation && (
          <p className="text-xs text-foreground/80 mt-1 line-clamp-1">
            <ChevronRight className="inline h-3 w-3 rtl:rotate-180" />
            {insight.recommendation}
          </p>
        )}
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="shrink-0 h-6 w-6"
        onClick={() => dismiss.mutate(insight.id)}
      >
        <X className="h-3 w-3" />
      </Button>
    </div>
  );
}

export const EnhancedAIInsights = memo(function EnhancedAIInsights() {
  const { data, isLoading } = useAIInsights({ limit: 5, status: 'NEW' });

  const insights: AIInsight[] = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">AI Insights</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex gap-3 p-3 rounded-lg border">
              <Skeleton className="h-4 w-4 mt-0.5" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-full" />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-blue-500" />
            </span>
            AI Insights
            {insights.length > 0 && (
              <Badge variant="secondary" className="text-xs">
                {insights.length}
              </Badge>
            )}
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        {insights.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <Eye className="h-8 w-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">No new insights. Your business looks healthy!</p>
          </div>
        ) : (
          <div className="space-y-2">
            {insights.map((insight) => (
              <InsightCard key={insight.id} insight={insight} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
});
