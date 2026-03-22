'use client';

import { memo } from 'react';
import { useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';
import { BillStatusItem } from '@/lib/hooks/use-dashboard-sections';
import { formatCompactCurrency } from '@/lib/hooks/use-dashboard';

interface BillStatusChartProps {
  data: BillStatusItem[];
  currency?: string;
}

const STATUS_COLORS: Record<string, string> = {
  DRAFT: '#94a3b8',
  PENDING: '#f59e0b',
  OPEN: '#3b82f6',
  PARTIALLY_PAID: '#8b5cf6',
  PAID: '#22c55e',
  OVERDUE: '#ef4444',
  VOID: '#6b7280',
};

const FALLBACK_COLOR = '#94a3b8';

export const BillStatusChart = memo(function BillStatusChart({
  data,
  currency = 'USD',
}: BillStatusChartProps) {
  const t = useTranslations('common.dashboard.charts');

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('billStatus')}</CardTitle>
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
                nameKey="status"
              >
                {data.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={STATUS_COLORS[entry.status] ?? FALLBACK_COLOR}
                  />
                ))}
              </Pie>
              <Tooltip
                formatter={(value: number, name: string, props: { payload?: BillStatusItem }) => [
                  `${value} (${formatCompactCurrency(props.payload?.amount ?? 0, currency)})`,
                  name,
                ]}
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
                formatter={(value) => <span className="text-sm">{value}</span>}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
});
