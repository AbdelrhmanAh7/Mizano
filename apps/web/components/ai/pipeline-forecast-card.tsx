'use client';

import { Brain, TrendingUp, Target, Percent } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { usePipelineForecast, useStageConversionRates } from '@/lib/hooks/use-ai';
import { formatRevenue, formatProbability } from '@/lib/hooks/use-ai-pipeline-forecast';

export function PipelineForecastCard() {
  const { data: forecastData, isLoading: forecastLoading } = usePipelineForecast(3);
  const { data: conversionData, isLoading: conversionLoading } = useStageConversionRates();

  if (forecastLoading || conversionLoading) {
    return <Skeleton className="h-48 mb-6" />;
  }

  const forecasts = forecastData?.data || [];
  const conversions = conversionData?.data || [];

  if (forecasts.length === 0 && conversions.length === 0) return null;

  const nextMonth = forecasts[0];
  const avgConversion =
    conversions.length > 0
      ? conversions.reduce((sum: number, c: any) => sum + (c.conversionRate || 0), 0) /
        conversions.length
      : 0;

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="text-base font-medium flex items-center gap-2">
          <Brain className="h-5 w-5 text-purple-600" />
          AI Pipeline Forecast
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Next Month Forecast */}
          {nextMonth && (
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <TrendingUp className="h-4 w-4" />
                <span>Forecasted Revenue</span>
              </div>
              <div className="text-2xl font-bold">
                {formatRevenue(nextMonth.predictedRevenue || 0)}
              </div>
              <div className="text-xs text-muted-foreground">
                {nextMonth.expectedDeals || 0} expected deals
              </div>
              <Badge variant="outline" className="mt-1">
                {formatProbability(nextMonth.confidence || 0)} confidence
              </Badge>
            </div>
          )}

          {/* Confidence Range */}
          {nextMonth && (
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Target className="h-4 w-4" />
                <span>Confidence Range</span>
              </div>
              <div className="text-sm font-medium">
                {formatRevenue(nextMonth.lowerBound || 0)} -{' '}
                {formatRevenue(nextMonth.upperBound || 0)}
              </div>
              <div className="text-xs text-muted-foreground">
                Expected range for {nextMonth.month}
              </div>
            </div>
          )}

          {/* Conversion Rate */}
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Percent className="h-4 w-4" />
              <span>Avg Conversion Rate</span>
            </div>
            <div className="text-2xl font-bold">{formatProbability(avgConversion)}</div>
            <div className="text-xs text-muted-foreground">Across all stages</div>
          </div>
        </div>

        {/* Stage Conversions */}
        {conversions.length > 0 && (
          <div className="mt-4 pt-4 border-t">
            <div className="text-sm font-medium mb-2">Stage Conversion Rates</div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {conversions.slice(0, 6).map((conv: any) => (
                <div key={`${conv.fromStage}-${conv.toStage}`} className="text-xs">
                  <span className="text-muted-foreground">
                    {conv.fromStage} → {conv.toStage}
                  </span>
                  <Badge variant="outline" className="ml-1">
                    {formatProbability(conv.conversionRate || 0)}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
