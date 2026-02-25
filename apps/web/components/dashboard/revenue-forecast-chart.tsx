'use client';

import { memo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { useRevenueForecast, type RevenueForcast } from '@/lib/hooks/use-ai-insights';
import { formatCompactCurrency } from '@/lib/hooks/use-dashboard';

function formatMonth(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short' });
}

export const RevenueForecastChart = memo(function RevenueForecastChart() {
  const { data, isLoading } = useRevenueForecast(6);

  const forecasts: RevenueForcast[] = Array.isArray(data?.data)
    ? data.data
    : Array.isArray(data)
      ? data
      : [];

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <Skeleton className="h-5 w-44" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[300px] w-full rounded" />
        </CardContent>
      </Card>
    );
  }

  if (forecasts.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Revenue Forecast</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[300px] flex items-center justify-center text-muted-foreground text-sm">
            Not enough data for revenue predictions yet.
          </div>
        </CardContent>
      </Card>
    );
  }

  const chartData = forecasts.map((f) => ({
    month: formatMonth(f.date),
    actual: f.actualRevenue ?? null,
    predicted: f.predictedRevenue,
    variance: f.variance != null ? Math.round(f.variance) : null,
  }));

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <CardTitle className="text-lg">Revenue Forecast</CardTitle>
          <Badge variant="outline" className="text-[10px]">
            AI Predicted
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="month"
                axisLine={false}
                tickLine={false}
                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
                tickFormatter={(v) => formatCompactCurrency(v)}
              />
              <Tooltip
                formatter={(value, name) => [
                  typeof value === 'number' ? formatCompactCurrency(value) : '—',
                  name === 'actual'
                    ? 'Actual Revenue'
                    : name === 'predicted'
                      ? 'AI Predicted'
                      : (name as string),
                ]}
                contentStyle={{
                  backgroundColor: 'hsl(var(--background))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                  fontSize: '12px',
                }}
              />
              <Legend />
              <Bar
                dataKey="actual"
                name="Actual Revenue"
                fill="#22c55e"
                radius={[4, 4, 0, 0]}
                barSize={32}
              />
              <Line
                type="monotone"
                dataKey="predicted"
                name="AI Predicted"
                stroke="#8b5cf6"
                strokeWidth={2}
                strokeDasharray="5 5"
                dot={{ fill: '#8b5cf6', strokeWidth: 2, r: 4 }}
                activeDot={{ r: 6 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
});
