'use client';

import { memo } from 'react';
import { useTranslations } from 'next-intl';
import { PieChart, Pie, Cell, Legend, Tooltip } from 'recharts';
import { InvoiceStatusItem } from '@/lib/hooks/use-dashboard-sections';
import { ChartCard, CHART_TOOLTIP_STYLE } from '@/components/dashboard/charts/chart-card';

interface InvoiceStatusChartProps {
  data: InvoiceStatusItem[];
}

const STATUS_COLORS: Record<string, string> = {
  DRAFT: '#94a3b8',
  SENT: '#3b82f6',
  PARTIALLY_PAID: '#f59e0b',
  PAID: '#22c55e',
  OVERDUE: '#ef4444',
  VOID: '#6b7280',
};

const FALLBACK_COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#6b7280'];

export const InvoiceStatusChart = memo(function InvoiceStatusChart({
  data,
}: InvoiceStatusChartProps) {
  const t = useTranslations('common.dashboard.charts');

  return (
    <ChartCard title={t('invoiceStatus')}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={60}
          outerRadius={100}
          paddingAngle={2}
          dataKey="count"
          nameKey="status"
        >
          {data.map((entry, index) => (
            <Cell
              key={`cell-${index}`}
              fill={STATUS_COLORS[entry.status] || FALLBACK_COLORS[index % FALLBACK_COLORS.length]}
            />
          ))}
        </Pie>
        <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
        <Legend layout="vertical" align="right" verticalAlign="middle" />
      </PieChart>
    </ChartCard>
  );
});
