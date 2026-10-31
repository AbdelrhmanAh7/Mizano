'use client';

import { memo } from 'react';
import { useTranslations } from 'next-intl';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { CLVSegmentItem } from '@/lib/hooks/use-dashboard-sections';
import { useCompactMoneyFormatter } from '@/lib/hooks/use-money-formatter';
import {
  ChartCard,
  CHART_AXIS,
  CHART_TOOLTIP_STYLE,
} from '@/components/dashboard/charts/chart-card';

interface CustomerLTVChartProps {
  data: CLVSegmentItem[];
  currency?: string;
}

export const CustomerLTVChart = memo(function CustomerLTVChart({
  data,
  currency,
}: CustomerLTVChartProps) {
  const formatCompactCurrency = useCompactMoneyFormatter();
  const t = useTranslations('common.dashboard.charts');

  return (
    <ChartCard title={t('customerLTV')}>
      <BarChart data={data} layout="vertical" margin={{ top: 10, right: 30, left: 80, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
        <XAxis
          type="number"
          {...CHART_AXIS}
          tickFormatter={(v) => formatCompactCurrency(v, currency)}
        />
        <YAxis type="category" dataKey="segment" {...CHART_AXIS} width={70} />
        <Tooltip
          formatter={(value: number) => formatCompactCurrency(value, currency)}
          contentStyle={CHART_TOOLTIP_STYLE}
        />
        <Bar dataKey="avgValue" name={t('avgLifetimeValue')} fill="#8b5cf6" radius={[0, 4, 4, 0]} />
      </BarChart>
    </ChartCard>
  );
});
