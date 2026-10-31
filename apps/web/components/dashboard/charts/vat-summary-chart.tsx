'use client';

import { memo } from 'react';
import { useTranslations } from 'next-intl';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { VATSummaryItem } from '@/lib/hooks/use-dashboard-sections';
import { useCompactMoneyFormatter } from '@/lib/hooks/use-money-formatter';
import {
  ChartCard,
  CHART_AXIS,
  CHART_TOOLTIP_STYLE,
} from '@/components/dashboard/charts/chart-card';

interface VATSummaryChartProps {
  data: VATSummaryItem[];
  currency?: string;
}

export const VATSummaryChart = memo(function VATSummaryChart({
  data,
  currency,
}: VATSummaryChartProps) {
  const formatCompactCurrency = useCompactMoneyFormatter();
  const t = useTranslations('common.dashboard.charts');

  return (
    <ChartCard title={t('vatSummary')}>
      <BarChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="period" {...CHART_AXIS} />
        <YAxis {...CHART_AXIS} tickFormatter={(v) => formatCompactCurrency(v, currency)} />
        <Tooltip
          formatter={(value: number) => formatCompactCurrency(value, currency)}
          contentStyle={CHART_TOOLTIP_STYLE}
        />
        <Legend />
        <Bar dataKey="outputVAT" name={t('outputVAT')} fill="#3b82f6" radius={[4, 4, 0, 0]} />
        <Bar dataKey="inputVAT" name={t('inputVAT')} fill="#22c55e" radius={[4, 4, 0, 0]} />
        <Bar dataKey="netPayable" name={t('netPayable')} fill="#f59e0b" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ChartCard>
  );
});
