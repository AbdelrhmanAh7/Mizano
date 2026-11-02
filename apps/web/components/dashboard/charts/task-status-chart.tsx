'use client';

import { memo } from 'react';
import { useTranslations } from 'next-intl';
import { PieChart, Pie, Cell, Tooltip, Legend } from 'recharts';
import { TaskStatusItem } from '@/lib/hooks/use-dashboard-sections';
import { ChartCard, CHART_TOOLTIP_STYLE } from '@/components/dashboard/charts/chart-card';

interface TaskStatusChartProps {
  data: TaskStatusItem[];
}

const STATUS_COLORS: Record<string, string> = {
  TODO: 'hsl(var(--muted-foreground))',
  IN_PROGRESS: 'hsl(var(--chart-2))',
  REVIEW: 'hsl(var(--warning))',
  DONE: 'hsl(var(--success))',
};

export const TaskStatusChart = memo(function TaskStatusChart({ data }: TaskStatusChartProps) {
  const t = useTranslations('common.dashboard.charts');

  const STATUS_LABELS: Record<string, string> = {
    TODO: t('todo'),
    IN_PROGRESS: t('inProgress'),
    REVIEW: t('review'),
    DONE: t('done'),
  };

  const chartData = data.map((item) => ({
    ...item,
    label: STATUS_LABELS[item.status] ?? item.status,
  }));

  return (
    <ChartCard title={t('taskStatus')}>
      <PieChart>
        <Pie
          data={chartData}
          cx="50%"
          cy="50%"
          innerRadius={60}
          outerRadius={100}
          paddingAngle={4}
          dataKey="count"
          nameKey="label"
        >
          {chartData.map((entry, index) => (
            <Cell
              key={`cell-${index}`}
              fill={STATUS_COLORS[entry.status] ?? 'hsl(var(--muted-foreground))'}
            />
          ))}
        </Pie>
        <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
        <Legend iconType="circle" />
      </PieChart>
    </ChartCard>
  );
});
