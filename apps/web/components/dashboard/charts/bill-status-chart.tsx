'use client';

import { memo } from 'react';
import { useTranslations } from 'next-intl';
import { PieChart, Pie, Cell, Legend, Tooltip } from 'recharts';
import { BillStatusItem } from '@/lib/hooks/use-dashboard-sections';
import { useCompactMoneyFormatter } from '@/lib/hooks/use-money-formatter';
import { ChartCard, CHART_TOOLTIP_STYLE } from '@/components/dashboard/charts/chart-card';

interface BillStatusChartProps {
  data: BillStatusItem[];
  currency?: string;
}

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'hsl(var(--muted-foreground))',
  PENDING: 'hsl(var(--warning))',
  OPEN: 'hsl(var(--chart-2))',
  PARTIALLY_PAID: 'hsl(var(--chart-4))',
  PAID: 'hsl(var(--success))',
  OVERDUE: 'hsl(var(--destructive))',
  VOID: 'hsl(var(--muted-foreground))',
};

const FALLBACK_COLOR = 'hsl(var(--muted-foreground))';

export const BillStatusChart = memo(function BillStatusChart({
  data,
  currency,
}: BillStatusChartProps) {
  const formatCompactCurrency = useCompactMoneyFormatter();
  const t = useTranslations('common.dashboard.charts');

  return (
    <ChartCard title={t('billStatus')}>
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
            <Cell key={`cell-${index}`} fill={STATUS_COLORS[entry.status] ?? FALLBACK_COLOR} />
          ))}
        </Pie>
        <Tooltip
          formatter={(value: number, name: string, props: { payload?: BillStatusItem }) => [
            `${value} (${formatCompactCurrency(props.payload?.amount ?? 0, currency)})`,
            name,
          ]}
          contentStyle={CHART_TOOLTIP_STYLE}
        />
        <Legend
          layout="vertical"
          align="right"
          verticalAlign="middle"
          formatter={(value) => <span className="text-sm">{value}</span>}
        />
      </PieChart>
    </ChartCard>
  );
});
