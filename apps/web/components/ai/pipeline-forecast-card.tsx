'use client';

import { Brain, TrendingUp, Target, BarChart3, Percent } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { usePipelineForecast, useStageConversionRates } from '@/lib/hooks/use-ai';
import { formatRevenue } from '@/lib/hooks/use-ai-pipeline-forecast';

// API response shape from GET /ai/pipeline/forecast
interface ForecastMonth {
  month: string;
  predicted: number;
  confidence: number;
}

interface ForecastResult {
  totalWeighted: number;
  totalUnweighted: number;
  forecastByMonth: ForecastMonth[];
  activeDeals: number;
  avgDealSize: number;
  avgDaysToClose: number;
  predictionMethod?: string;
}

// API response shape from GET /ai/pipeline/conversion-rates
interface StageRate {
  stage: string;
  totalDeals: number;
  wonDeals: number;
  lostDeals: number;
  winRate: number;
  avgAmount: number;
}

export function PipelineForecastCard() {
  const t = useTranslations('ai.pipelineForecast');
  const { data: forecastData, isLoading: forecastLoading } = usePipelineForecast(3);
  const { data: conversionData, isLoading: conversionLoading } = useStageConversionRates();

  if (forecastLoading || conversionLoading) {
    return <Skeleton className="h-48 mb-6" />;
  }

  const forecastResult: ForecastResult | undefined = forecastData?.data;
  const forecastByMonth: ForecastMonth[] = forecastResult?.forecastByMonth ?? [];
  const conversions: StageRate[] = Array.isArray(conversionData?.data) ? conversionData.data : [];

  const hasAnyData =
    forecastByMonth.length > 0 ||
    (forecastResult && forecastResult.activeDeals > 0) ||
    conversions.length > 0;

  if (!hasAnyData) return null;

  const nextMonth = forecastByMonth[0];
  // Derive confidence bounds from the confidence score
  const lowerBound = nextMonth
    ? Math.round(nextMonth.predicted * (nextMonth.confidence * 0.85))
    : 0;
  const upperBound = nextMonth
    ? Math.round(nextMonth.predicted * (1 + (1 - nextMonth.confidence) * 0.4))
    : 0;

  const avgWinRate =
    conversions.length > 0
      ? conversions.reduce((sum, c) => sum + c.winRate, 0) / conversions.length
      : 0;

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="text-base font-medium flex items-center gap-2">
          <Brain className="h-5 w-5 text-purple-600" />
          {t('title')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Next Month Forecast */}
          {nextMonth ? (
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <TrendingUp className="h-4 w-4" />
                <span>{t('forecastedRevenue')}</span>
              </div>
              <div className="text-2xl font-bold">{formatRevenue(nextMonth.predicted)}</div>
              <div className="text-xs text-muted-foreground">
                {t('activeDeals', { count: forecastResult?.activeDeals ?? 0 })}
              </div>
              <Badge variant="outline" className="mt-1">
                {t('confidence', { value: Math.round(nextMonth.confidence * 100) })}
              </Badge>
            </div>
          ) : (
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <TrendingUp className="h-4 w-4" />
                <span>{t('weightedPipeline')}</span>
              </div>
              <div className="text-2xl font-bold">
                {formatRevenue(forecastResult?.totalWeighted ?? 0)}
              </div>
              <div className="text-xs text-muted-foreground">
                {t('activeDeals', { count: forecastResult?.activeDeals ?? 0 })}
              </div>
            </div>
          )}

          {/* Confidence Range */}
          {nextMonth && (
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Target className="h-4 w-4" />
                <span>{t('confidenceRange')}</span>
              </div>
              <div className="text-sm font-medium">
                {formatRevenue(lowerBound)} – {formatRevenue(upperBound)}
              </div>
              <div className="text-xs text-muted-foreground">
                {t('expectedRangeFor', { month: nextMonth.month })}
              </div>
            </div>
          )}

          {/* Avg Days to Close */}
          {forecastResult && forecastResult.avgDaysToClose > 0 && (
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <BarChart3 className="h-4 w-4" />
                <span>{t('avgDaysToClose')}</span>
              </div>
              <div className="text-2xl font-bold">{forecastResult.avgDaysToClose}</div>
              <div className="text-xs text-muted-foreground">
                {t('avgDealSize', { amount: formatRevenue(forecastResult.avgDealSize) })}
              </div>
            </div>
          )}

          {/* Conversion Rate (fallback when no monthly forecast) */}
          {!forecastResult?.avgDaysToClose && conversions.length > 0 && (
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Percent className="h-4 w-4" />
                <span>{t('avgWinRate')}</span>
              </div>
              <div className="text-2xl font-bold">{Math.round(avgWinRate * 100)}%</div>
              <div className="text-xs text-muted-foreground">{t('acrossAllStages')}</div>
            </div>
          )}
        </div>

        {/* Stage Win Rates */}
        {conversions.length > 0 && (
          <div className="mt-4 pt-4 border-t">
            <div className="text-sm font-medium mb-2">{t('stageWinRates')}</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {conversions.map((conv) => (
                <div key={conv.stage} className="text-xs">
                  <span className="text-muted-foreground">{conv.stage}</span>
                  <Badge variant="outline" className="ml-1">
                    {Math.round(conv.winRate * 100)}%
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
