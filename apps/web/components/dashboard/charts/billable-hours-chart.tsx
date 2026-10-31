'use client';

import { memo } from 'react';
import { useTranslations } from 'next-intl';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { BillableHoursPoint } from '@/lib/hooks/use-dashboard-sections';
import {
  ChartCard,
  CHART_AXIS,
  CHART_TOOLTIP_STYLE,
} from '@/components/dashboard/charts/chart-card';

interface BillableHoursChartProps {
  data: BillableHoursPoint[];
}

export const BillableHoursChart = memo(function BillableHoursChart({
  data,
}: BillableHoursChartProps) {
  const t = useTranslations('common.dashboard.charts');

  return (
    <ChartCard title={t('billableHours')}>
      <AreaChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="billableGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="nonBillableGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#94a3b8" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#94a3b8" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="month" {...CHART_AXIS} />
        <YAxis {...CHART_AXIS} />
        <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
        <Legend wrapperStyle={{ paddingTop: '10px' }} iconType="circle" />
        <Area
          type="monotone"
          dataKey="billable"
          name={t('billable')}
          stroke="#22c55e"
          strokeWidth={2}
          fill="url(#billableGradient)"
          stackId="1"
        />
        <Area
          type="monotone"
          dataKey="nonBillable"
          name={t('nonBillable')}
          stroke="#94a3b8"
          strokeWidth={2}
          fill="url(#nonBillableGradient)"
          stackId="1"
        />
      </AreaChart>
    </ChartCard>
  );
});
