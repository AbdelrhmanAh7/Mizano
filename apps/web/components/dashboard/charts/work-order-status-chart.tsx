'use client';

import { memo } from 'react';
import { useTranslations } from 'next-intl';
import { PieChart, Pie, Cell, Tooltip, Legend } from 'recharts';
import { WorkOrderStatusItem } from '@/lib/hooks/use-dashboard-sections';
import { ChartCard, CHART_TOOLTIP_STYLE } from '@/components/dashboard/charts/chart-card';

interface WorkOrderStatusChartProps {
  data: WorkOrderStatusItem[];
}

const STATUS_COLORS: Record<string, string> = {
  DRAFT: '#94a3b8',
  IN_PROCESS: '#3b82f6',
  COMPLETED: '#22c55e',
  CANCELLED: '#ef4444',
};

export const WorkOrderStatusChart = memo(function WorkOrderStatusChart({
  data,
}: WorkOrderStatusChartProps) {
  const t = useTranslations('common.dashboard.charts');

  const STATUS_LABELS: Record<string, string> = {
    DRAFT: t('draft'),
    IN_PROCESS: t('inProcess'),
    COMPLETED: t('completed'),
    CANCELLED: t('cancelled'),
  };

  const chartData = data.map((item) => ({
    ...item,
    label: STATUS_LABELS[item.status] ?? item.status,
  }));

  return (
    <ChartCard title={t('workOrderStatus')}>
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
            <Cell key={`cell-${index}`} fill={STATUS_COLORS[entry.status] ?? '#94a3b8'} />
          ))}
        </Pie>
        <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
        <Legend iconType="circle" />
      </PieChart>
    </ChartCard>
  );
});
