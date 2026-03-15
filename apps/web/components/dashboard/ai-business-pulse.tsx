'use client';

import { memo } from 'react';
import { Brain, TrendingUp, AlertTriangle, Sparkles, CalendarClock } from 'lucide-react';
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
        <span className="text-xs font-medium text-muted-foreground truncate">{label}</span>
      </div>
      {children}
    </div>
  );
}

function ForecastCell({
  label,
  data,
}: {
  label: string;
  data?: { low: number; expected: number; high: number };
}) {
  return (
    <div className="text-center">
      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-0.5">
        {label}
      </p>
      {data ? (
        <>
          <p className="text-base font-bold font-mono">{formatCompactCurrency(data.expected)}</p>
          <p className="text-[10px] text-muted-foreground">
            {formatCompactCurrency(data.low)} – {formatCompactCurrency(data.high)}
          </p>
        </>
      ) : (
        <p className="text-base font-bold font-mono text-muted-foreground">—</p>
      )}
    </div>
  );
}

function SectionSkeleton() {
  return (
    <div className="space-y-2">
      <Skeleton className="h-3 w-20" />
      <Skeleton className="h-6 w-24" />
      <Skeleton className="h-3 w-28" />
    </div>
  );
}

export const AIBusinessPulse = memo(function AIBusinessPulse() {
  const { data: cashForecast, isLoading: cashLoading } = useQuickCashForecast();
  const { data: alertSummary, isLoading: alertsLoading } = useAlertSummary();
  const { data: weeklySnapshot, isLoading: narrativeLoading } = useWeeklySnapshot();

  const criticalCount = alertSummary?.criticalCount ?? 0;
  const unreadCount = alertSummary?.unread ?? 0;
  const topRecommendation =
    weeklySnapshot?.recommendations?.[0] || weeklySnapshot?.summary || 'All systems operational';
  const criticalDates: Array<{ date: string; reason: string; impact: number }> =
    cashForecast?.criticalDates ?? [];

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

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Cash Flow Forecasts — 7 / 30 / 90 days */}
          {cashLoading ? (
            <SectionSkeleton />
          ) : (
            <PulseSection icon={TrendingUp} label="Cash Flow Forecast">
              <div className="flex items-end gap-3">
                <ForecastCell label="7d" data={cashForecast?.next7Days} />
                <ForecastCell label="30d" data={cashForecast?.next30Days} />
                <ForecastCell label="90d" data={cashForecast?.next90Days} />
              </div>
            </PulseSection>
          )}

          {/* Critical Dates */}
          {cashLoading ? (
            <SectionSkeleton />
          ) : (
            <PulseSection icon={CalendarClock} label="Critical Dates">
              {criticalDates.length > 0 ? (
                <div className="space-y-1">
                  {criticalDates.slice(0, 2).map((cd, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      <span className="text-xs font-mono text-red-600">
                        {formatCompactCurrency(Math.abs(cd.impact))}
                      </span>
                      <span className="text-xs text-muted-foreground truncate">{cd.reason}</span>
                    </div>
                  ))}
                  {criticalDates.length > 2 && (
                    <p className="text-[10px] text-muted-foreground">
                      +{criticalDates.length - 2} more
                    </p>
                  )}
                </div>
              ) : (
                <>
                  <p className="text-sm font-medium text-green-600">None</p>
                  <p className="text-xs text-muted-foreground">No critical cash events ahead</p>
                </>
              )}
            </PulseSection>
          )}

          {/* Critical Alerts */}
          {alertsLoading ? (
            <SectionSkeleton />
          ) : (
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
          )}

          {/* AI Recommendation */}
          {narrativeLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-6 w-full" />
            </div>
          ) : (
            <PulseSection icon={Sparkles} label="Top AI Recommendation">
              <p className="text-sm leading-snug line-clamp-2">{topRecommendation}</p>
            </PulseSection>
          )}
        </div>
      </CardContent>
    </Card>
  );
});
