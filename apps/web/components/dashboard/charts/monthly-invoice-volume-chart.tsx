'use client';

import { memo } from 'react';
import { useTranslations } from 'next-intl';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { InvoiceVolumePoint } from '@/lib/hooks/use-dashboard-sections';
import {
  ChartCard,
  CHART_AXIS,
  CHART_TOOLTIP_STYLE,
} from '@/components/dashboard/charts/chart-card';
import { monthLabel } from '@/lib/month-label';

interface MonthlyInvoiceVolumeChartProps {
  data: InvoiceVolumePoint[];
}

export const MonthlyInvoiceVolumeChart = memo(function MonthlyInvoiceVolumeChart({
  data,
}: MonthlyInvoiceVolumeChartProps) {
  const t = useTranslations('common.dashboard.charts');

  return (
    <ChartCard title={t('monthlyInvoiceVolume')}>
      <BarChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="month" tickFormatter={monthLabel} {...CHART_AXIS} />
        <YAxis {...CHART_AXIS} allowDecimals={false} />
        <Tooltip labelFormatter={monthLabel} contentStyle={CHART_TOOLTIP_STYLE} />
        <Bar dataKey="count" name={t('invoices')} fill="#3b82f6" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ChartCard>
  );
});
