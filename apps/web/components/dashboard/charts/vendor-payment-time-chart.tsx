'use client';

import { memo } from 'react';
import { useTranslations } from 'next-intl';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { VendorPaymentTimeItem } from '@/lib/hooks/use-dashboard-sections';
import {
  ChartCard,
  CHART_AXIS,
  CHART_TOOLTIP_STYLE,
} from '@/components/dashboard/charts/chart-card';

interface VendorPaymentTimeChartProps {
  data: VendorPaymentTimeItem[];
}

export const VendorPaymentTimeChart = memo(function VendorPaymentTimeChart({
  data,
}: VendorPaymentTimeChartProps) {
  const t = useTranslations('common.dashboard.charts');

  return (
    <ChartCard title={t('vendorPaymentTime')}>
      <BarChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="vendorName" {...CHART_AXIS} />
        <YAxis {...CHART_AXIS} tickFormatter={(value) => `${value}d`} />
        <Tooltip
          formatter={(value: number) => [`${value} ${t('days')}`, t('vendorPaymentTime')]}
          contentStyle={CHART_TOOLTIP_STYLE}
          cursor={{ fill: 'hsl(var(--muted))' }}
        />
        <Bar dataKey="avgDays" name={t('days')} fill="#3b82f6" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ChartCard>
  );
});
