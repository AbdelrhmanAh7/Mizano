'use client';

import { memo } from 'react';
import { useTranslations } from 'next-intl';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { useCompactMoneyFormatter } from '@/lib/hooks/use-money-formatter';
import {
  ChartCard,
  CHART_AXIS,
  CHART_TOOLTIP_STYLE,
} from '@/components/dashboard/charts/chart-card';
import { monthLabel } from '@/lib/month-label';

interface BankBalancePoint {
  month: string;
  balance: number;
}

interface BankBalanceChartProps {
  data: BankBalancePoint[];
  currency?: string;
}

export const BankBalanceChart = memo(function BankBalanceChart({
  data,
  currency,
}: BankBalanceChartProps) {
  const formatCompactCurrency = useCompactMoneyFormatter();
  const t = useTranslations('common.dashboard.charts');

  return (
    <ChartCard title={t('bankBalanceTrend')}>
      <AreaChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="balanceGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="month" tickFormatter={monthLabel} {...CHART_AXIS} />
        <YAxis {...CHART_AXIS} tickFormatter={(value) => formatCompactCurrency(value, currency)} />
        <Tooltip labelFormatter={monthLabel}
          formatter={(value: number) => formatCompactCurrency(value, currency)}
          contentStyle={CHART_TOOLTIP_STYLE}
        />
        <Area
          type="monotone"
          dataKey="balance"
          name={t('balance')}
          stroke="#8b5cf6"
          strokeWidth={2}
          fill="url(#balanceGradient)"
        />
      </AreaChart>
    </ChartCard>
  );
});
