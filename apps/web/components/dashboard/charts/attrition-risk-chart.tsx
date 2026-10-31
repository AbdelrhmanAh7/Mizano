'use client';

import { memo } from 'react';
import { useTranslations } from 'next-intl';
import { PieChart, Pie, Cell, Legend, Tooltip } from 'recharts';
import { AttritionRiskItem } from '@/lib/hooks/use-dashboard-sections';
import { ChartCard, CHART_TOOLTIP_STYLE } from '@/components/dashboard/charts/chart-card';

interface AttritionRiskChartProps {
  data: AttritionRiskItem[];
}

const LEVEL_COLORS: Record<string, string> = {
  Low: '#22c55e',
  Medium: '#f59e0b',
  High: '#ef4444',
};

const FALLBACK_COLOR = '#94a3b8';

export const AttritionRiskChart = memo(function AttritionRiskChart({
  data,
}: AttritionRiskChartProps) {
  const t = useTranslations('common.dashboard.charts');

  return (
    <ChartCard title={t('attritionRisk')}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={60}
          outerRadius={100}
          paddingAngle={2}
          dataKey="count"
          nameKey="level"
        >
          {data.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={LEVEL_COLORS[entry.level] ?? FALLBACK_COLOR} />
          ))}
        </Pie>
        <Tooltip
          formatter={(value: number, _name: string, props: { payload?: AttritionRiskItem }) => [
            `${value} (${props.payload?.percentage ?? 0}%)`,
            props.payload?.level ?? '',
          ]}
          contentStyle={CHART_TOOLTIP_STYLE}
        />
        <Legend
          layout="vertical"
          align="right"
          verticalAlign="middle"
          formatter={(value, entry) => (
            <span className="text-sm">
              {value} ({(entry as { payload?: { percentage?: number } }).payload?.percentage}
              %)
            </span>
          )}
        />
      </PieChart>
    </ChartCard>
  );
});
