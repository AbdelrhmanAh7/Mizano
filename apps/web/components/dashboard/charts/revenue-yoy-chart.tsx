'use client';

import { memo } from 'react';
import { useTranslations } from 'next-intl';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { RevenueYoYPoint } from '@/lib/hooks/use-dashboard-sections';
import { useCompactMoneyFormatter } from '@/lib/hooks/use-money-formatter';
import {
  ChartCard,
  CHART_AXIS,
  CHART_TOOLTIP_STYLE,
} from '@/components/dashboard/charts/chart-card';

interface RevenueYoYChartProps {
  data: RevenueYoYPoint[];
  currency?: string;
}

export const RevenueYoYChart = memo(function RevenueYoYChart({
  data,
  currency,
}: RevenueYoYChartProps) {
  const formatCompactCurrency = useCompactMoneyFormatter();
  const t = useTranslations('common.dashboard.charts');

  return (
    <ChartCard title={t('revenueYoY')}>
      <BarChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="month" {...CHART_AXIS} />
        <YAxis {...CHART_AXIS} tickFormatter={(v) => formatCompactCurrency(v, currency)} />
        <Tooltip
          formatter={(value: number) => formatCompactCurrency(value, currency)}
          contentStyle={CHART_TOOLTIP_STYLE}
        />
        <Legend />
        <Bar dataKey="currentYear" name={t('currentYear')} fill="#3b82f6" radius={[4, 4, 0, 0]} />
        <Bar dataKey="previousYear" name={t('previousYear')} fill="#94a3b8" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ChartCard>
  );
});
