'use client';

import { memo } from 'react';
import { useTranslations } from 'next-intl';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { RevenuePoint } from '@/lib/hooks/use-dashboard';
import { useCompactMoneyFormatter } from '@/lib/hooks/use-money-formatter';
import {
  ChartCard,
  CHART_AXIS,
  CHART_TOOLTIP_STYLE,
} from '@/components/dashboard/charts/chart-card';

interface RevenueChartProps {
  data: RevenuePoint[];
  currency?: string;
}

export const RevenueChart = memo(function RevenueChart({ data, currency }: RevenueChartProps) {
  const formatCompactCurrency = useCompactMoneyFormatter();
  const t = useTranslations('common.dashboard.charts');

  return (
    <ChartCard title={t('revenueTrend')}>
      <AreaChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="month" {...CHART_AXIS} />
        <YAxis {...CHART_AXIS} tickFormatter={(value) => formatCompactCurrency(value, currency)} />
        <Tooltip
          formatter={(value: number) => formatCompactCurrency(value, currency)}
          contentStyle={CHART_TOOLTIP_STYLE}
        />
        <Area
          type="monotone"
          dataKey="revenue"
          name={t('revenue')}
          stroke="#22c55e"
          strokeWidth={2}
          fill="url(#revenueGradient)"
        />
      </AreaChart>
    </ChartCard>
  );
});
