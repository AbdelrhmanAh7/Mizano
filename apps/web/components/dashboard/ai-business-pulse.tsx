'use client';

import { memo } from 'react';
import {
  Brain,
  TrendingUp,
  AlertTriangle,
  Sparkles,
  ArrowRight,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useQuickCashForecast } from '@/lib/hooks/use-ai-cash-flow';
import { useAlertSummary } from '@/lib/hooks/use-ai-alerts';
import { useWeeklySnapshot } from '@/lib/hooks/use-ai-narrative';
import { formatCompactCurrency } from '@/lib/hooks/use-dashboard';

function PulseSection({
  icon: Icon,
  label,
  children,
  className,
}: {
  icon: React.ElementType;
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex-1 min-w-0', className)}>
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs font-medium text-muted-foreground truncate">
          {label}
        </span>
      </div>
      {children}
    </div>
  );
}

export const AIBusinessPulse = memo(function AIBusinessPulse() {
  const { data: cashForecast, isLoading: cashLoading } = useQuickCashForecast();
  const { data: alertSummary, isLoading: alertsLoading } = useAlertSummary();
  const { data: weeklySnapshot, isLoading: narrativeLoading } = useWeeklySnapshot();

  const isLoading = cashLoading || alertsLoading || narrativeLoading;

  if (isLoading) {
    return (
      <Card className="bg-gradient-to-r from-slate-50 to-blue-50 dark:from-slate-900 dark:to-blue-950 border-blue-100 dark:border-blue-900">
        <CardContent className="py-4">
          <div className="flex items-center gap-2 mb-3">
            <Skeleton className="h-5 w-5 rounded" />
            <Skeleton className="h-4 w-32" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-6 w-24" />
                <Skeleton className="h-3 w-28" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const forecast30 = cashForecast?.next30Days;
  const criticalCount = alertSummary?.criticalCount ?? 0;
  const unreadCount = alertSummary?.unread ?? 0;
  const topRecommendation =
    weeklySnapshot?.recommendations?.[0] ||
    weeklySnapshot?.summary ||
    'All systems operational';

  return (
    <Card className="bg-gradient-to-r from-slate-50 to-blue-50 dark:from-slate-900 dark:to-blue-950 border-blue-100 dark:border-blue-900">
      <CardContent className="py-4">
        <div className="flex items-center gap-2 mb-3">
          <div className="rounded-md bg-blue-100 dark:bg-blue-900 p-1">
            <Brain className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          </div>
          <span className="text-sm font-semibold">AI Business Pulse</span>
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
            Live
          </Badge>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* 30-Day Cash Forecast */}
          <PulseSection icon={TrendingUp} label="30-Day Cash Forecast">
            {forecast30 ? (
              <>
                <p className="text-lg font-bold font-mono">
                  {formatCompactCurrency(forecast30.expected)}
                </p>
                <p className="text-xs text-muted-foreground">
                  Range: {formatCompactCurrency(forecast30.low)} –{' '}
                  {formatCompactCurrency(forecast30.high)}
                </p>
              </>
            ) : (
              <>
                <p className="text-lg font-bold font-mono text-muted-foreground">
                  —
                </p>
                <p className="text-xs text-muted-foreground">
                  Not enough data yet
                </p>
              </>
            )}
          </PulseSection>

          {/* Critical Alerts */}
          <PulseSection icon={AlertTriangle} label="Critical Alerts">
            <p
              className={cn(
                'text-lg font-bold font-mono',
                criticalCount > 0 ? 'text-red-600' : 'text-green-600',
              )}
            >
              {criticalCount}
            </p>
            <p className="text-xs text-muted-foreground">
              {unreadCount > 0
                ? `${unreadCount} unread alert${unreadCount !== 1 ? 's' : ''}`
                : 'All clear'}
            </p>
          </PulseSection>

          {/* AI Recommendation */}
          <PulseSection
            icon={Sparkles}
            label="Top AI Recommendation"
            className="md:col-span-2"
          >
            <p className="text-sm leading-snug line-clamp-2">
              {topRecommendation}
            </p>
          </PulseSection>
        </div>
      </CardContent>
    </Card>
  );
});
