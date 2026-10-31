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
  DRAFT: '#94a3b8',
  PENDING: '#f59e0b',
  OPEN: '#3b82f6',
  PARTIALLY_PAID: '#8b5cf6',
  PAID: '#22c55e',
  OVERDUE: '#ef4444',
  VOID: '#6b7280',
};

const FALLBACK_COLOR = '#94a3b8';

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
