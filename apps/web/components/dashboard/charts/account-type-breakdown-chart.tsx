'use client';

import { memo } from 'react';
import { useTranslations } from 'next-intl';
import { PieChart, Pie, Cell, Legend, Tooltip } from 'recharts';
import { AccountBalance } from '@/lib/hooks/use-dashboard-sections';
import { useCompactMoneyFormatter } from '@/lib/hooks/use-money-formatter';
import { ChartCard, CHART_TOOLTIP_STYLE } from '@/components/dashboard/charts/chart-card';

interface AccountTypeBreakdownChartProps {
  data: AccountBalance[];
  currency?: string;
}

const COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6'];

export const AccountTypeBreakdownChart = memo(function AccountTypeBreakdownChart({
  data,
  currency,
}: AccountTypeBreakdownChartProps) {
  const formatCompactCurrency = useCompactMoneyFormatter();
  const t = useTranslations('common.dashboard.charts');

  return (
    <ChartCard title={t('accountTypeBreakdown')}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={60}
          outerRadius={100}
          paddingAngle={2}
          dataKey="balance"
          nameKey="type"
        >
          {data.map((_entry, index) => (
            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip
          formatter={(value: number) => formatCompactCurrency(value, currency)}
          contentStyle={CHART_TOOLTIP_STYLE}
        />
        <Legend layout="vertical" align="right" verticalAlign="middle" />
      </PieChart>
    </ChartCard>
  );
});
