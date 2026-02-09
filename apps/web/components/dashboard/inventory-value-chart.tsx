'use client';

import { memo } from 'react';
import { useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { formatCompactCurrency } from '@/lib/hooks/use-dashboard';

interface InventoryValuePoint {
  month: string;
  value: number;
  itemCount: number;
}

interface InventoryValueChartProps {
  data: InventoryValuePoint[];
  currency?: string;
}

export const InventoryValueChart = memo(function InventoryValueChart({
  data,
  currency = 'USD',
}: InventoryValueChartProps) {
  const t = useTranslations('common.dashboard.charts');

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('inventoryValue')}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={data}
              margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="month"
                axisLine={false}
                tickLine={false}
                tick={{ fill: 'hsl(var(--muted-foreground))' }}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fill: 'hsl(var(--muted-foreground))' }}
                tickFormatter={(value) => formatCompactCurrency(value, currency)}
              />
              <Tooltip
                formatter={(value: number, name: string) => {
                  if (name === 'value') {
                    return formatCompactCurrency(value, currency);
                  }
                  return value;
                }}
                contentStyle={{
                  backgroundColor: 'hsl(var(--background))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                }}
              />
              <Line
                type="monotone"
                dataKey="value"
                name={t('totalValue')}
                stroke="#f59e0b"
                strokeWidth={3}
                dot={{ fill: '#f59e0b', r: 4 }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
});
