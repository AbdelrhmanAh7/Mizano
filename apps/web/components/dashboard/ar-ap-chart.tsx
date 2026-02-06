'use client';

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
  Legend,
} from 'recharts';
import { ReceivablesPayables, formatCompactCurrency } from '@/lib/hooks/use-dashboard';

interface ARAPChartProps {
  data: ReceivablesPayables;
  currency?: string;
}

export function ARAPChart({ data, currency = 'USD' }: ARAPChartProps) {
  const t = useTranslations('common.dashboard.charts');

  const chartData = [
    {
      name: t('receivables'),
      value: data.receivables,
      fill: '#3b82f6',
    },
    {
      name: t('payables'),
      value: data.payables,
      fill: '#ef4444',
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('receivablesPayables')}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[250px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              layout="vertical"
              margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
              <XAxis
                type="number"
                tickFormatter={(value) => formatCompactCurrency(value, currency)}
              />
              <YAxis type="category" dataKey="name" width={100} />
              <Tooltip
                formatter={(value: number) => formatCompactCurrency(value, currency)}
                contentStyle={{
                  backgroundColor: 'hsl(var(--background))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                }}
              />
              <Bar dataKey="value" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-4 flex justify-center gap-8 text-sm">
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded bg-blue-500" />
            <span className="text-muted-foreground">{t('outstanding')}</span>
            <span className="font-mono font-medium">
              {formatCompactCurrency(data.receivables, currency)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded bg-red-500" />
            <span className="text-muted-foreground">{t('owed')}</span>
            <span className="font-mono font-medium">
              {formatCompactCurrency(data.payables, currency)}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
