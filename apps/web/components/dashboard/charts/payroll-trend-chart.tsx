'use client';

import { memo } from 'react';
import { useTranslations } from 'next-intl';
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { PayrollTrendPoint } from '@/lib/hooks/use-dashboard-sections';
import { useCompactMoneyFormatter } from '@/lib/hooks/use-money-formatter';
import {
  ChartCard,
  CHART_AXIS,
  CHART_TOOLTIP_STYLE,
} from '@/components/dashboard/charts/chart-card';
import { monthLabel } from '@/lib/month-label';

interface PayrollTrendChartProps {
  data: PayrollTrendPoint[];
  currency?: string;
}

export const PayrollTrendChart = memo(function PayrollTrendChart({
  data,
  currency,
}: PayrollTrendChartProps) {
  const formatCompactCurrency = useCompactMoneyFormatter();
  const t = useTranslations('common.dashboard.charts');

  return (
    <ChartCard title={t('payrollTrend')}>
      <ComposedChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="month" tickFormatter={monthLabel} {...CHART_AXIS} />
        <YAxis {...CHART_AXIS} tickFormatter={(value) => formatCompactCurrency(value, currency)} />
        <Tooltip labelFormatter={monthLabel}
          formatter={(value: number) => formatCompactCurrency(value, currency)}
          contentStyle={CHART_TOOLTIP_STYLE}
        />
        <Legend wrapperStyle={{ paddingTop: '10px' }} iconType="circle" />
        <Bar
          dataKey="grossPay"
          name={t('grossPay')}
          fill="#3b82f6"
          fillOpacity={0.6}
          stackId="payroll"
          radius={[0, 0, 0, 0]}
        />
        <Bar
          dataKey="deductions"
          name={t('deductions')}
          fill="#ef4444"
          fillOpacity={0.6}
          stackId="payroll"
          radius={[4, 4, 0, 0]}
        />
        <Line
          type="monotone"
          dataKey="netPay"
          name={t('netPay')}
          stroke="#22c55e"
          strokeWidth={3}
          dot={{ fill: '#22c55e', r: 4 }}
          activeDot={{ r: 6 }}
        />
      </ComposedChart>
    </ChartCard>
  );
});
