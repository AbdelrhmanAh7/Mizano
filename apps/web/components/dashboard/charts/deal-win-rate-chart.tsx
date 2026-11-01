'use client';

import { memo } from 'react';
import { useTranslations } from 'next-intl';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { DealWinRatePoint } from '@/lib/hooks/use-dashboard-sections';
import {
  ChartCard,
  CHART_AXIS,
  CHART_TOOLTIP_STYLE,
} from '@/components/dashboard/charts/chart-card';
import { monthLabel } from '@/lib/month-label';

interface DealWinRateChartProps {
  data: DealWinRatePoint[];
}

export const DealWinRateChart = memo(function DealWinRateChart({ data }: DealWinRateChartProps) {
  const t = useTranslations('common.dashboard.charts');

  return (
    <ChartCard title={t('dealWinRate')}>
      <LineChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="month" tickFormatter={monthLabel} {...CHART_AXIS} />
        <YAxis {...CHART_AXIS} tickFormatter={(value) => `${value}%`} />
        <Tooltip labelFormatter={monthLabel}
          formatter={(value: number) => [`${value.toFixed(1)}%`, t('winRate')]}
          contentStyle={CHART_TOOLTIP_STYLE}
        />
        <Line
          type="monotone"
          dataKey="rate"
          name={t('winRate')}
          stroke="#3b82f6"
          strokeWidth={3}
          dot={{ fill: '#3b82f6', r: 4 }}
          activeDot={{ r: 6 }}
        />
      </LineChart>
    </ChartCard>
  );
});
