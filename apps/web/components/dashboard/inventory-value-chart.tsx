'use client';

import { memo } from 'react';
import { useTranslations } from 'next-intl';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { useCompactMoneyFormatter } from '@/lib/hooks/use-money-formatter';
import {
  ChartCard,
  CHART_AXIS,
  CHART_TOOLTIP_STYLE,
} from '@/components/dashboard/charts/chart-card';
import { monthLabel } from '@/lib/month-label';

interface InventoryValuePoint {
  month: string;
  value: number;
  itemCount: number;
}

interface InventoryValueChartProps {
  data: InventoryValuePoint[];
  currency?: string;
}

export const InventoryValueChart = memo(function InventoryValueChart({
  data,
  currency,
}: InventoryValueChartProps) {
  const formatCompactCurrency = useCompactMoneyFormatter();
  const t = useTranslations('common.dashboard.charts');

  return (
    <ChartCard title={t('inventoryValue')}>
      <LineChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="month" tickFormatter={monthLabel} {...CHART_AXIS} />
        <YAxis {...CHART_AXIS} tickFormatter={(value) => formatCompactCurrency(value, currency)} />
        <Tooltip
          labelFormatter={monthLabel}
          formatter={(value: number, name: string) => {
            if (name === 'value') {
              return formatCompactCurrency(value, currency);
            }
            return value;
          }}
          contentStyle={CHART_TOOLTIP_STYLE}
        />
        <Line
          type="monotone"
          dataKey="value"
          name={t('totalValue')}
          stroke="hsl(var(--warning))"
          strokeWidth={3}
          dot={{ fill: 'hsl(var(--warning))', r: 4 }}
          activeDot={{ r: 6 }}
        />
      </LineChart>
    </ChartCard>
  );
});
