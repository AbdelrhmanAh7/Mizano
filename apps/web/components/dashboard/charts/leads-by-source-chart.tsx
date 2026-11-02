'use client';

import { memo } from 'react';
import { useTranslations } from 'next-intl';
import { PieChart, Pie, Cell, Tooltip, Legend } from 'recharts';
import { LeadSourceItem } from '@/lib/hooks/use-dashboard-sections';
import { ChartCard, CHART_TOOLTIP_STYLE } from '@/components/dashboard/charts/chart-card';

interface LeadsBySourceChartProps {
  data: LeadSourceItem[];
}

const SOURCE_COLORS: Record<string, string> = {
  WEBSITE: 'hsl(var(--chart-2))',
  FACEBOOK_ADS: 'hsl(var(--chart-4))',
  GOOGLE_ADS: 'hsl(var(--success))',
  REFERRAL: 'hsl(var(--warning))',
  COLD_CALL: 'hsl(var(--destructive))',
  OTHER: 'hsl(var(--muted-foreground))',
};

export const LeadsBySourceChart = memo(function LeadsBySourceChart({
  data,
}: LeadsBySourceChartProps) {
  const t = useTranslations('common.dashboard.charts');

  const SOURCE_LABELS: Record<string, string> = {
    WEBSITE: t('website'),
    FACEBOOK_ADS: t('facebookAds'),
    GOOGLE_ADS: t('googleAds'),
    REFERRAL: t('referral'),
    COLD_CALL: t('coldCall'),
    OTHER: t('other'),
  };

  const chartData = data.map((item) => ({
    ...item,
    label: SOURCE_LABELS[item.source] ?? item.source,
  }));

  return (
    <ChartCard title={t('leadsBySource')}>
      <PieChart>
        <Pie
          data={chartData}
          cx="50%"
          cy="50%"
          innerRadius={60}
          outerRadius={100}
          paddingAngle={4}
          dataKey="count"
          nameKey="label"
        >
          {chartData.map((entry, index) => (
            <Cell
              key={`cell-${index}`}
              fill={SOURCE_COLORS[entry.source] ?? 'hsl(var(--muted-foreground))'}
            />
          ))}
        </Pie>
        <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
        <Legend iconType="circle" />
      </PieChart>
    </ChartCard>
  );
});
