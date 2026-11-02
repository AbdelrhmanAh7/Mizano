'use client';

import { memo } from 'react';
import { useTranslations } from 'next-intl';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { CashFlowPoint } from '@/lib/hooks/use-dashboard';
import { useCompactMoneyFormatter } from '@/lib/hooks/use-money-formatter';
import {
  ChartCard,
  CHART_AXIS,
  CHART_TOOLTIP_STYLE,
} from '@/components/dashboard/charts/chart-card';
import { monthLabel } from '@/lib/month-label';

interface CashFlowChartProps {
  data: CashFlowPoint[];
  currency?: string;
}

export const CashFlowChart = memo(function CashFlowChart({ data, currency }: CashFlowChartProps) {
  const formatCompactCurrency = useCompactMoneyFormatter();
  const t = useTranslations('common.dashboard.charts');

  return (
    <ChartCard title={t('cashFlowTrend')}>
      <LineChart data={data} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="month" tickFormatter={monthLabel} {...CHART_AXIS} />
        <YAxis {...CHART_AXIS} tickFormatter={(value) => formatCompactCurrency(value, currency)} />
        <Tooltip
          labelFormatter={monthLabel}
          formatter={(value: number) => formatCompactCurrency(value, currency)}
          contentStyle={CHART_TOOLTIP_STYLE}
        />
        <Legend />
        <Line
          type="monotone"
          dataKey="inflow"
          name={t('inflow')}
          stroke="hsl(var(--success))"
          strokeWidth={2}
          dot={{ fill: 'hsl(var(--success))', strokeWidth: 2 }}
          activeDot={{ r: 6 }}
        />
        <Line
          type="monotone"
          dataKey="outflow"
          name={t('outflow')}
          stroke="hsl(var(--destructive))"
          strokeWidth={2}
          dot={{ fill: 'hsl(var(--destructive))', strokeWidth: 2 }}
          activeDot={{ r: 6 }}
        />
        <Line
          type="monotone"
          dataKey="net"
          name={t('net')}
          stroke="hsl(var(--chart-2))"
          strokeWidth={2}
          strokeDasharray="5 5"
          dot={{ fill: 'hsl(var(--chart-2))', strokeWidth: 2 }}
          activeDot={{ r: 6 }}
        />
      </LineChart>
    </ChartCard>
  );
});
