'use client';

import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useDealPipeline,
  useLeadsBySource,
  useLeadConversionTrend,
  useDealWinRate,
} from '@/lib/hooks/use-dashboard-sections';
import { DealPipelineChart } from '@/components/dashboard/charts/deal-pipeline-chart';
import { LeadsBySourceChart } from '@/components/dashboard/charts/leads-by-source-chart';
import { LeadConversionTrendChart } from '@/components/dashboard/charts/lead-conversion-trend-chart';
import { DealWinRateChart } from '@/components/dashboard/charts/deal-win-rate-chart';

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

interface CRMSectionProps {
  enabled: boolean;
}

export function CRMSection({ enabled }: CRMSectionProps) {
  const { data: pipelineData } = useDealPipeline(enabled);
  const { data: sourceData } = useLeadsBySource(enabled);
  const { data: conversionData } = useLeadConversionTrend(enabled);
  const { data: winRateData } = useDealWinRate(enabled);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {pipelineData ? <DealPipelineChart data={pipelineData} /> : <ChartSkeleton />}
        {sourceData ? <LeadsBySourceChart data={sourceData} /> : <ChartSkeleton />}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {conversionData ? <LeadConversionTrendChart data={conversionData} /> : <ChartSkeleton />}
        {winRateData ? <DealWinRateChart data={winRateData} /> : <ChartSkeleton />}
      </div>
    </div>
  );
}
