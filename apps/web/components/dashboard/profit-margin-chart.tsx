'use client';

import { memo } from 'react';
import { useTranslations } from 'next-intl';
import { ComposedChart, Line, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { useCompactMoneyFormatter } from '@/lib/hooks/use-money-formatter';
import {
  ChartCard,
  CHART_AXIS,
  CHART_TOOLTIP_STYLE,
} from '@/components/dashboard/charts/chart-card';

interface ProfitPoint {
  month: string;
  revenue: number;
  expenses: number;
  profit: number;
}

interface ProfitMarginChartProps {
  data: ProfitPoint[];
  currency?: string;
}

export const ProfitMarginChart = memo(function ProfitMarginChart({
  data,
  currency,
}: ProfitMarginChartProps) {
  const formatCompactCurrency = useCompactMoneyFormatter();
  const t = useTranslations('common.dashboard.charts');

  return (
    <ChartCard title={t('profitMargin')}>
      <ComposedChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="profitGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="month" {...CHART_AXIS} />
        <YAxis {...CHART_AXIS} tickFormatter={(value) => formatCompactCurrency(value, currency)} />
        <Tooltip
          formatter={(value: number) => formatCompactCurrency(value, currency)}
          contentStyle={CHART_TOOLTIP_STYLE}
        />
        <Legend wrapperStyle={{ paddingTop: '10px' }} iconType="circle" />
        <Bar
          dataKey="revenue"
          name={t('revenue')}
          fill="#3b82f6"
          fillOpacity={0.6}
          radius={[4, 4, 0, 0]}
        />
        <Bar
          dataKey="expenses"
          name={t('expenses')}
          fill="#ef4444"
          fillOpacity={0.6}
          radius={[4, 4, 0, 0]}
        />
        <Line
          type="monotone"
          dataKey="profit"
          name={t('profit')}
          stroke="#10b981"
          strokeWidth={3}
          dot={{ fill: '#10b981', r: 4 }}
          activeDot={{ r: 6 }}
        />
      </ComposedChart>
    </ChartCard>
  );
});
