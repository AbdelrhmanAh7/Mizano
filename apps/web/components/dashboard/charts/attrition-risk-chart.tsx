'use client';

import { memo } from 'react';
import { useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';
import { AttritionRiskItem } from '@/lib/hooks/use-dashboard-sections';

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
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('attritionRisk')}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
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
                formatter={(
                  value: number,
                  _name: string,
                  props: { payload?: AttritionRiskItem },
                ) => [`${value} (${props.payload?.percentage ?? 0}%)`, props.payload?.level ?? '']}
                contentStyle={{
                  backgroundColor: 'hsl(var(--background))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                }}
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
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
});
