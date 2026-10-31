'use client';

import { memo } from 'react';
import { useTranslations } from 'next-intl';
import { PieChart, Pie, Cell, Legend, Tooltip } from 'recharts';
import { ChurnRiskItem } from '@/lib/hooks/use-dashboard-sections';
import { ChartCard, CHART_TOOLTIP_STYLE } from '@/components/dashboard/charts/chart-card';

interface CustomerChurnRiskChartProps {
  data: ChurnRiskItem[];
}

const RISK_COLORS: Record<string, string> = {
  Low: '#22c55e',
  Medium: '#f59e0b',
  High: '#ef4444',
};

const FALLBACK_COLORS = ['#22c55e', '#f59e0b', '#ef4444'];

export const CustomerChurnRiskChart = memo(function CustomerChurnRiskChart({
  data,
}: CustomerChurnRiskChartProps) {
  const t = useTranslations('common.dashboard.charts');

  return (
    <ChartCard title={t('customerChurnRisk')}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={60}
          outerRadius={100}
          paddingAngle={2}
          dataKey="count"
          nameKey="segment"
        >
          {data.map((entry, index) => (
            <Cell
              key={`cell-${index}`}
              fill={RISK_COLORS[entry.segment] || FALLBACK_COLORS[index % FALLBACK_COLORS.length]}
            />
          ))}
        </Pie>
        <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
        <Legend layout="vertical" align="right" verticalAlign="middle" />
      </PieChart>
    </ChartCard>
  );
});
