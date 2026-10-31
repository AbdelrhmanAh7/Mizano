'use client';

import { memo } from 'react';
import { useTranslations } from 'next-intl';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { ProjectProfitabilityItem } from '@/lib/hooks/use-dashboard-sections';
import { useCompactMoneyFormatter } from '@/lib/hooks/use-money-formatter';
import {
  ChartCard,
  CHART_AXIS,
  CHART_TOOLTIP_STYLE,
} from '@/components/dashboard/charts/chart-card';

interface ProjectProfitabilityChartProps {
  data: ProjectProfitabilityItem[];
  currency?: string;
}

export const ProjectProfitabilityChart = memo(function ProjectProfitabilityChart({
  data,
  currency,
}: ProjectProfitabilityChartProps) {
  const formatCompactCurrency = useCompactMoneyFormatter();
  const t = useTranslations('common.dashboard.charts');

  return (
    <ChartCard title={t('projectProfitability')}>
      <BarChart data={data} layout="vertical" margin={{ top: 5, right: 30, left: 100, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
        <XAxis
          type="number"
          {...CHART_AXIS}
          tickFormatter={(value) => formatCompactCurrency(value, currency)}
        />
        <YAxis type="category" dataKey="name" {...CHART_AXIS} width={90} />
        <Tooltip
          formatter={(value: number) => formatCompactCurrency(value, currency)}
          contentStyle={CHART_TOOLTIP_STYLE}
        />
        <Legend wrapperStyle={{ paddingTop: '10px' }} iconType="circle" />
        <Bar dataKey="revenue" name={t('revenue')} fill="#22c55e" radius={[0, 4, 4, 0]} />
        <Bar dataKey="cost" name={t('costToDate')} fill="#ef4444" radius={[0, 4, 4, 0]} />
      </BarChart>
    </ChartCard>
  );
});
