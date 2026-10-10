'use client';

import { memo } from 'react';
import { useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { formatCompactCurrency } from '@/lib/hooks/use-dashboard';

interface AgingBucket {
  bucket: string;
  amount: number;
}

interface ReceivablesAgingChartProps {
  data: AgingBucket[];
  currency: string;
}

const BUCKET_COLORS = ['#22c55e', '#84cc16', '#f59e0b', '#f97316', '#ef4444'];

export const ReceivablesAgingChart = memo(function ReceivablesAgingChart({
  data,
  currency,
}: ReceivablesAgingChartProps) {
  const t = useTranslations('common.dashboard.charts');

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('receivablesAging')}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="bucket"
                axisLine={false}
                tickLine={false}
                tick={{ fill: 'hsl(var(--muted-foreground))' }}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fill: 'hsl(var(--muted-foreground))' }}
                tickFormatter={(v) => formatCompactCurrency(v, currency)}
              />
              <Tooltip
                formatter={(value: number) => formatCompactCurrency(value, currency)}
                contentStyle={{
                  backgroundColor: 'hsl(var(--background))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                }}
              />
              <Bar dataKey="amount" name={t('amount')} radius={[4, 4, 0, 0]}>
                {data.map((_entry, index) => (
                  <Cell key={`cell-${index}`} fill={BUCKET_COLORS[index % BUCKET_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
});
