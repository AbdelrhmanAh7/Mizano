'use client';

import { memo } from 'react';
import { useTranslations } from 'next-intl';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { ProjectBudgetItem } from '@/lib/hooks/use-dashboard-sections';
import { useCompactMoneyFormatter } from '@/lib/hooks/use-money-formatter';
import {
  ChartCard,
  CHART_AXIS,
  CHART_TOOLTIP_STYLE,
} from '@/components/dashboard/charts/chart-card';

interface ProjectBudgetsChartProps {
  data: ProjectBudgetItem[];
  currency?: string;
}

export const ProjectBudgetsChart = memo(function ProjectBudgetsChart({
  data,
  currency,
}: ProjectBudgetsChartProps) {
  const formatCompactCurrency = useCompactMoneyFormatter();
  const t = useTranslations('common.dashboard.charts');

  return (
    <ChartCard title={t('projectBudgets')}>
      <BarChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="name" {...CHART_AXIS} />
        <YAxis {...CHART_AXIS} tickFormatter={(value) => formatCompactCurrency(value, currency)} />
        <Tooltip
          formatter={(value: number) => formatCompactCurrency(value, currency)}
          contentStyle={CHART_TOOLTIP_STYLE}
        />
        <Legend wrapperStyle={{ paddingTop: '10px' }} iconType="circle" />
        <Bar
          dataKey="budget"
          name={t('budgetUsed')}
          fill="hsl(var(--chart-2))"
          radius={[4, 4, 0, 0]}
        />
        <Bar
          dataKey="spent"
          name={t('costToDate')}
          fill="hsl(var(--destructive))"
          radius={[4, 4, 0, 0]}
        />
      </BarChart>
    </ChartCard>
  );
});
