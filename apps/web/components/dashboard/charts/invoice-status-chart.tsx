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
  DRAFT: 'hsl(var(--muted-foreground))',
  SENT: 'hsl(var(--chart-2))',
  PARTIALLY_PAID: 'hsl(var(--warning))',
  PAID: 'hsl(var(--success))',
  OVERDUE: 'hsl(var(--destructive))',
  VOID: 'hsl(var(--muted-foreground))',
};

const FALLBACK_COLORS = [
  'hsl(var(--chart-1))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
  'hsl(var(--muted-foreground))',
];

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
