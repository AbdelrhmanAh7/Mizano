'use client';

import { memo } from 'react';
import { useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { formatCompactCurrency } from '@/lib/hooks/use-dashboard';
import { CLVSegmentItem } from '@/lib/hooks/use-dashboard-sections';

interface CustomerLTVChartProps {
  data: CLVSegmentItem[];
  currency: string;
}

export const CustomerLTVChart = memo(function CustomerLTVChart({
  data,
  currency,
}: CustomerLTVChartProps) {
  const t = useTranslations('common.dashboard.charts');

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('customerLTV')}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data}
              layout="vertical"
              margin={{ top: 10, right: 30, left: 80, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis
                type="number"
                axisLine={false}
                tickLine={false}
                tick={{ fill: 'hsl(var(--muted-foreground))' }}
                tickFormatter={(v) => formatCompactCurrency(v, currency)}
              />
              <YAxis
                type="category"
                dataKey="segment"
                axisLine={false}
                tickLine={false}
                tick={{ fill: 'hsl(var(--muted-foreground))' }}
                width={70}
              />
              <Tooltip
                formatter={(value: number) => formatCompactCurrency(value, currency)}
                contentStyle={{
                  backgroundColor: 'hsl(var(--background))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                }}
              />
              <Bar
                dataKey="avgValue"
                name={t('avgLifetimeValue')}
                fill="#8b5cf6"
                radius={[0, 4, 4, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
});
