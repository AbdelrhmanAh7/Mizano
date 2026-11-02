'use client';

import { memo } from 'react';
import { useTranslations } from 'next-intl';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { SalaryDistributionItem } from '@/lib/hooks/use-dashboard-sections';
import {
  ChartCard,
  CHART_AXIS,
  CHART_TOOLTIP_STYLE,
} from '@/components/dashboard/charts/chart-card';

interface SalaryDistributionChartProps {
  data: SalaryDistributionItem[];
}

export const SalaryDistributionChart = memo(function SalaryDistributionChart({
  data,
}: SalaryDistributionChartProps) {
  const t = useTranslations('common.dashboard.charts');

  return (
    <ChartCard title={t('salaryDistribution')}>
      <BarChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="range" {...CHART_AXIS} />
        <YAxis {...CHART_AXIS} allowDecimals={false} />
        <Tooltip
          formatter={(value: number) => [value, t('employees')]}
          contentStyle={CHART_TOOLTIP_STYLE}
          cursor={{ fill: 'hsl(var(--muted))' }}
        />
        <Bar
          dataKey="count"
          name={t('employees')}
          fill="hsl(var(--chart-4))"
          radius={[4, 4, 0, 0]}
        />
      </BarChart>
    </ChartCard>
  );
});
