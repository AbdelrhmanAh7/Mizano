'use client';

import { memo } from 'react';
import { useTranslations } from 'next-intl';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell } from 'recharts';
import { DealPipelineItem } from '@/lib/hooks/use-dashboard-sections';
import { useCompactMoneyFormatter } from '@/lib/hooks/use-money-formatter';
import {
  ChartCard,
  CHART_AXIS,
  CHART_TOOLTIP_STYLE,
} from '@/components/dashboard/charts/chart-card';

interface DealPipelineChartProps {
  data: DealPipelineItem[];
  currency?: string;
}

const STAGE_COLORS: Record<string, string> = {
  NEW: '#94a3b8',
  MEETING_SCHEDULED: '#3b82f6',
  PROPOSAL_SENT: '#8b5cf6',
  NEGOTIATION: '#f59e0b',
  WON: '#22c55e',
  LOST: '#ef4444',
};

export const DealPipelineChart = memo(function DealPipelineChart({
  data,
  currency,
}: DealPipelineChartProps) {
  const formatCompactCurrency = useCompactMoneyFormatter();
  const t = useTranslations('common.dashboard.charts');

  const STAGE_LABELS: Record<string, string> = {
    NEW: t('new'),
    MEETING_SCHEDULED: t('meetingScheduled'),
    PROPOSAL_SENT: t('proposalSent'),
    NEGOTIATION: t('negotiation'),
    WON: t('won'),
    LOST: t('lost'),
  };

  const chartData = data.map((item) => ({
    ...item,
    label: STAGE_LABELS[item.stage] ?? item.stage,
  }));

  return (
    <ChartCard title={t('dealPipeline')}>
      <BarChart
        data={chartData}
        layout="vertical"
        margin={{ top: 5, right: 30, left: 120, bottom: 5 }}
      >
        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
        <XAxis
          type="number"
          {...CHART_AXIS}
          tickFormatter={(value) => formatCompactCurrency(value, currency)}
        />
        <YAxis type="category" dataKey="label" {...CHART_AXIS} width={110} />
        <Tooltip
          formatter={(value: number) => formatCompactCurrency(value, currency)}
          contentStyle={CHART_TOOLTIP_STYLE}
        />
        <Bar dataKey="value" name={t('amount')} radius={[0, 4, 4, 0]}>
          {chartData.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={STAGE_COLORS[entry.stage] ?? '#94a3b8'} />
          ))}
        </Bar>
      </BarChart>
    </ChartCard>
  );
});
