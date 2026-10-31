'use client';

import { memo } from 'react';
import { useTranslations } from 'next-intl';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { StockLevelItem } from '@/lib/hooks/use-dashboard-sections';
import {
  ChartCard,
  CHART_AXIS,
  CHART_TOOLTIP_STYLE,
} from '@/components/dashboard/charts/chart-card';

interface StockLevelsChartProps {
  data: StockLevelItem[];
}

export const StockLevelsChart = memo(function StockLevelsChart({ data }: StockLevelsChartProps) {
  const t = useTranslations('common.dashboard.charts');

  return (
    <ChartCard title={t('stockLevels')}>
      <BarChart data={data} layout="vertical" margin={{ top: 5, right: 30, left: 100, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
        <XAxis type="number" {...CHART_AXIS} />
        <YAxis type="category" dataKey="itemName" {...CHART_AXIS} width={90} />
        <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
        <Legend wrapperStyle={{ paddingTop: '10px' }} iconType="circle" />
        <Bar dataKey="currentStock" name={t('currentStock')} fill="#3b82f6" radius={[0, 4, 4, 0]} />
        <Bar
          dataKey="reorderLevel"
          name={t('reorderPoint')}
          fill="#ef4444"
          radius={[0, 4, 4, 0]}
          fillOpacity={0.5}
          strokeDasharray="3 3"
        />
      </BarChart>
    </ChartCard>
  );
});
