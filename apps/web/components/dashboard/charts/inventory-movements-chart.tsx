'use client';

import { memo } from 'react';
import { useTranslations } from 'next-intl';
import { ComposedChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { InventoryMovementPoint } from '@/lib/hooks/use-dashboard-sections';
import {
  ChartCard,
  CHART_AXIS,
  CHART_TOOLTIP_STYLE,
} from '@/components/dashboard/charts/chart-card';
import { monthLabel } from '@/lib/month-label';

interface InventoryMovementsChartProps {
  data: InventoryMovementPoint[];
}

export const InventoryMovementsChart = memo(function InventoryMovementsChart({
  data,
}: InventoryMovementsChartProps) {
  const t = useTranslations('common.dashboard.charts');

  return (
    <ChartCard title={t('inventoryMovements')}>
      <ComposedChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="month" tickFormatter={monthLabel} {...CHART_AXIS} />
        <YAxis {...CHART_AXIS} />
        <Tooltip labelFormatter={monthLabel} contentStyle={CHART_TOOLTIP_STYLE} />
        <Legend wrapperStyle={{ paddingTop: '10px' }} iconType="circle" />
        <Bar
          dataKey="inQty"
          name={t('inMovements')}
          fill="hsl(var(--success))"
          radius={[4, 4, 0, 0]}
        />
        <Bar
          dataKey="outQty"
          name={t('outMovements')}
          fill="hsl(var(--destructive))"
          radius={[4, 4, 0, 0]}
        />
      </ComposedChart>
    </ChartCard>
  );
});
