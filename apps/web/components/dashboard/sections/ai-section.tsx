'use client';

import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useAnomalyTimeline } from '@/lib/hooks/use-dashboard-sections';
import { AnomalyTimelineChart } from '@/components/dashboard/charts/anomaly-timeline-chart';
import { CashFlowForecastChart } from '@/components/dashboard/cash-flow-forecast-chart';
import { RevenueForecastChart } from '@/components/dashboard/revenue-forecast-chart';

function ChartSkeleton() {
  return (
    <Card>
      <CardHeader className="pb-2">
        <Skeleton className="h-5 w-32" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-[250px] w-full rounded" />
      </CardContent>
    </Card>
  );
}

interface AISectionProps {
  enabled: boolean;
}

export function AISection({ enabled }: AISectionProps) {
  const { data: anomalyData } = useAnomalyTimeline(enabled);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <CashFlowForecastChart />
        <RevenueForecastChart />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {anomalyData ? <AnomalyTimelineChart data={anomalyData} /> : <ChartSkeleton />}
      </div>
    </div>
  );
}
