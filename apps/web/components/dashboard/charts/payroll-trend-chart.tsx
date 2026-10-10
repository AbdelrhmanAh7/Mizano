'use client';

import { memo } from 'react';
import { useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { PayrollTrendPoint } from '@/lib/hooks/use-dashboard-sections';
import { formatCompactCurrency } from '@/lib/hooks/use-dashboard';

interface PayrollTrendChartProps {
  data: PayrollTrendPoint[];
  currency: string;
}

export const PayrollTrendChart = memo(function PayrollTrendChart({
  data,
  currency,
}: PayrollTrendChartProps) {
  const t = useTranslations('common.dashboard.charts');

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('payrollTrend')}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
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
                formatter={(value: number) => formatCompactCurrency(value, currency)}
                contentStyle={{
                  backgroundColor: 'hsl(var(--background))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                }}
              />
              <Legend wrapperStyle={{ paddingTop: '10px' }} iconType="circle" />
              <Bar
                dataKey="grossPay"
                name={t('grossPay')}
                fill="#3b82f6"
                fillOpacity={0.6}
                stackId="payroll"
                radius={[0, 0, 0, 0]}
              />
              <Bar
                dataKey="deductions"
                name={t('deductions')}
                fill="#ef4444"
                fillOpacity={0.6}
                stackId="payroll"
                radius={[4, 4, 0, 0]}
              />
              <Line
                type="monotone"
                dataKey="netPay"
                name={t('netPay')}
                stroke="#22c55e"
                strokeWidth={3}
                dot={{ fill: '#22c55e', r: 4 }}
                activeDot={{ r: 6 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
});
