'use client';

import { memo } from 'react';
import { useTranslations } from 'next-intl';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell } from 'recharts';
import { QuoteConversionItem } from '@/lib/hooks/use-dashboard-sections';
import {
  ChartCard,
  CHART_AXIS,
  CHART_TOOLTIP_STYLE,
} from '@/components/dashboard/charts/chart-card';

interface QuoteConversionChartProps {
  data: QuoteConversionItem[];
}

const STATUS_COLORS: Record<string, string> = {
  DRAFT: '#94a3b8',
  SENT: '#3b82f6',
  ACCEPTED: '#22c55e',
  REJECTED: '#ef4444',
  EXPIRED: '#f59e0b',
  CONVERTED: '#8b5cf6',
};

const FALLBACK_COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#6b7280'];

export const QuoteConversionChart = memo(function QuoteConversionChart({
  data,
}: QuoteConversionChartProps) {
  const t = useTranslations('common.dashboard.charts');

  return (
    <ChartCard title={t('quoteConversion')}>
      <BarChart data={data} layout="vertical" margin={{ top: 10, right: 30, left: 80, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
        <XAxis type="number" {...CHART_AXIS} />
        <YAxis type="category" dataKey="status" {...CHART_AXIS} />
        <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
        <Bar dataKey="count" name={t('quotes')} radius={[0, 4, 4, 0]}>
          {data.map((entry, index) => (
            <Cell
              key={`cell-${index}`}
              fill={STATUS_COLORS[entry.status] || FALLBACK_COLORS[index % FALLBACK_COLORS.length]}
            />
          ))}
        </Bar>
      </BarChart>
    </ChartCard>
  );
});
