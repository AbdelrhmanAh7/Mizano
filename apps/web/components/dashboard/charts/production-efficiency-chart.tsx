'use client';

import { memo } from 'react';
import { useTranslations } from 'next-intl';
import { ComposedChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { ProductionEfficiencyPoint } from '@/lib/hooks/use-dashboard-sections';
import {
  ChartCard,
  CHART_AXIS,
  CHART_TOOLTIP_STYLE,
} from '@/components/dashboard/charts/chart-card';

interface ProductionEfficiencyChartProps {
  data: ProductionEfficiencyPoint[];
}

export const ProductionEfficiencyChart = memo(function ProductionEfficiencyChart({
  data,
}: ProductionEfficiencyChartProps) {
  const t = useTranslations('common.dashboard.charts');

  return (
    <ChartCard title={t('productionEfficiency')}>
      <ComposedChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="month" {...CHART_AXIS} />
        <YAxis {...CHART_AXIS} />
        <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
        <Legend wrapperStyle={{ paddingTop: '10px' }} iconType="circle" />
        <Bar dataKey="planned" name={t('planned')} fill="#94a3b8" radius={[4, 4, 0, 0]} />
        <Bar dataKey="completed" name={t('completed')} fill="#22c55e" radius={[4, 4, 0, 0]} />
      </ComposedChart>
    </ChartCard>
  );
});
