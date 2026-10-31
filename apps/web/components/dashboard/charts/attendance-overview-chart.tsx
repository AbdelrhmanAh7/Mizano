'use client';

import { memo } from 'react';
import { useTranslations } from 'next-intl';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell } from 'recharts';
import { AttendanceOverviewItem } from '@/lib/hooks/use-dashboard-sections';
import {
  ChartCard,
  CHART_AXIS,
  CHART_TOOLTIP_STYLE,
} from '@/components/dashboard/charts/chart-card';

interface AttendanceOverviewChartProps {
  data: AttendanceOverviewItem[];
}

const STATUS_COLORS: Record<string, string> = {
  Present: '#22c55e',
  Absent: '#ef4444',
  Leave: '#f59e0b',
  HalfDay: '#3b82f6',
};

const FALLBACK_COLOR = '#94a3b8';

export const AttendanceOverviewChart = memo(function AttendanceOverviewChart({
  data,
}: AttendanceOverviewChartProps) {
  const t = useTranslations('common.dashboard.charts');

  return (
    <ChartCard title={t('attendanceOverview')}>
      <BarChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="status" {...CHART_AXIS} />
        <YAxis {...CHART_AXIS} allowDecimals={false} />
        <Tooltip
          formatter={(value: number) => [value, t('count')]}
          contentStyle={CHART_TOOLTIP_STYLE}
          cursor={{ fill: 'hsl(var(--muted))' }}
        />
        <Bar dataKey="count" name={t('count')} radius={[4, 4, 0, 0]}>
          {data.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={STATUS_COLORS[entry.status] ?? FALLBACK_COLOR} />
          ))}
        </Bar>
      </BarChart>
    </ChartCard>
  );
});
