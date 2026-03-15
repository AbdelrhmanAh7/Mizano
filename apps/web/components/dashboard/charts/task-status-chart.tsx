'use client';

import { memo } from 'react';
import { useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { TaskStatusItem } from '@/lib/hooks/use-dashboard-sections';

interface TaskStatusChartProps {
  data: TaskStatusItem[];
}

const STATUS_COLORS: Record<string, string> = {
  TODO: '#94a3b8',
  IN_PROGRESS: '#3b82f6',
  REVIEW: '#f59e0b',
  DONE: '#22c55e',
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
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('taskStatus')}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
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
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--background))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                }}
              />
              <Legend iconType="circle" />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
});
