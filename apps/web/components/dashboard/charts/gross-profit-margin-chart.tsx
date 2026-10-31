'use client';

import { memo } from 'react';
import { useTranslations } from 'next-intl';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { GrossMarginPoint } from '@/lib/hooks/use-dashboard-sections';
import {
  ChartCard,
  CHART_AXIS,
  CHART_TOOLTIP_STYLE,
} from '@/components/dashboard/charts/chart-card';

interface GrossProfitMarginChartProps {
  data: GrossMarginPoint[];
}

export const GrossProfitMarginChart = memo(function GrossProfitMarginChart({
  data,
}: GrossProfitMarginChartProps) {
  const t = useTranslations('common.dashboard.charts');

  return (
    <ChartCard title={t('grossProfitMargin')}>
      <LineChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="month" {...CHART_AXIS} />
        <YAxis {...CHART_AXIS} tickFormatter={(v) => `${v}%`} />
        <Tooltip
          formatter={(value: number) => `${value.toFixed(1)}%`}
          contentStyle={CHART_TOOLTIP_STYLE}
        />
        <Line
          type="monotone"
          dataKey="marginPercent"
          name={t('grossMargin')}
          stroke="#22c55e"
          strokeWidth={2}
          dot={{ r: 4 }}
        />
      </LineChart>
    </ChartCard>
  );
});
