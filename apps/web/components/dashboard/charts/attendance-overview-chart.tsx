'use client';

import { memo } from 'react';
import { useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { AttendanceOverviewItem } from '@/lib/hooks/use-dashboard-sections';

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
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('attendanceOverview')}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="status"
                axisLine={false}
                tickLine={false}
                tick={{ fill: 'hsl(var(--muted-foreground))' }}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fill: 'hsl(var(--muted-foreground))' }}
                allowDecimals={false}
              />
              <Tooltip
                formatter={(value: number) => [value, t('count')]}
                contentStyle={{
                  backgroundColor: 'hsl(var(--background))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                }}
                cursor={{ fill: 'hsl(var(--muted))' }}
              />
              <Bar dataKey="count" name={t('count')} radius={[4, 4, 0, 0]}>
                {data.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={STATUS_COLORS[entry.status] ?? FALLBACK_COLOR}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
});
