'use client';

import { memo } from 'react';
import { useTranslations } from 'next-intl';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell } from 'recharts';
import { useCompactMoneyFormatter } from '@/lib/hooks/use-money-formatter';
import {
  ChartCard,
  CHART_AXIS,
  CHART_TOOLTIP_STYLE,
} from '@/components/dashboard/charts/chart-card';

interface TopCustomer {
  id: string;
  name: string;
  totalRevenue: number;
  invoiceCount: number;
}

interface TopCustomersChartProps {
  data: TopCustomer[];
  currency?: string;
}

const COLORS = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981'];

export const TopCustomersChart = memo(function TopCustomersChart({
  data,
  currency,
}: TopCustomersChartProps) {
  const formatCompactCurrency = useCompactMoneyFormatter();
  const t = useTranslations('common.dashboard.charts');

  return (
    <ChartCard title={t('topCustomers')}>
      <BarChart data={data} layout="vertical" margin={{ top: 5, right: 30, left: 100, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
        <XAxis
          type="number"
          {...CHART_AXIS}
          tickFormatter={(value) => formatCompactCurrency(value, currency)}
        />
        <YAxis type="category" dataKey="name" {...CHART_AXIS} width={90} />
        <Tooltip
          formatter={(value: number) => formatCompactCurrency(value, currency)}
          contentStyle={CHART_TOOLTIP_STYLE}
          cursor={{ fill: 'hsl(var(--muted))' }}
        />
        <Bar dataKey="totalRevenue" name={t('revenue')} radius={[0, 4, 4, 0]}>
          {data.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ChartCard>
  );
});
