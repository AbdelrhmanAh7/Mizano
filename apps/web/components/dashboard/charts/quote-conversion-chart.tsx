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
  DRAFT: 'hsl(var(--muted-foreground))',
  SENT: 'hsl(var(--chart-2))',
  ACCEPTED: 'hsl(var(--success))',
  REJECTED: 'hsl(var(--destructive))',
  EXPIRED: 'hsl(var(--warning))',
  CONVERTED: 'hsl(var(--chart-4))',
};

const FALLBACK_COLORS = [
  'hsl(var(--chart-1))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
  'hsl(var(--muted-foreground))',
];

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
