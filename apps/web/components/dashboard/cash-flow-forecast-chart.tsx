'use client';

import { memo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { useCashFlowForecast, type CashFlowForecast } from '@/lib/hooks/use-ai-insights';
import { formatCompactCurrency } from '@/lib/hooks/use-dashboard';

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export const CashFlowForecastChart = memo(function CashFlowForecastChart() {
  const { data, isLoading } = useCashFlowForecast(30);

  const forecasts: CashFlowForecast[] = Array.isArray(data?.data)
    ? data.data
    : Array.isArray(data)
      ? data
      : [];

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <Skeleton className="h-5 w-48" />
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
          <CardTitle className="text-lg">Cash Flow Forecast</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[300px] flex items-center justify-center text-muted-foreground text-sm">
            Not enough data for cash flow predictions yet.
          </div>
        </CardContent>
      </Card>
    );
  }

  const chartData = forecasts.map((f) => ({
    date: formatDate(f.date),
    predicted: f.predictedBalance,
    lower: f.lowerBound,
    upper: f.upperBound,
    inflow: f.predictedInflow,
    outflow: f.predictedOutflow,
  }));

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <CardTitle className="text-lg">Cash Flow Forecast</CardTitle>
          <Badge variant="outline" className="text-[10px]">
            30-Day AI Prediction
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={chartData}
              margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="date"
                axisLine={false}
                tickLine={false}
                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
                interval="preserveStartEnd"
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
                tickFormatter={(v) => formatCompactCurrency(v)}
              />
              <Tooltip
                formatter={(value, name) => [
                  typeof value === 'number' ? formatCompactCurrency(value) : String(value),
                  name === 'predicted'
                    ? 'Expected'
                    : name === 'upper'
                      ? 'Optimistic (P90)'
                      : name === 'lower'
                        ? 'Conservative (P10)'
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
              {/* Confidence band */}
              <Area
                type="monotone"
                dataKey="upper"
                stroke="none"
                fill="#3b82f6"
                fillOpacity={0.08}
                name="Optimistic (P90)"
              />
              <Area
                type="monotone"
                dataKey="lower"
                stroke="none"
                fill="#ffffff"
                fillOpacity={1}
                name="Conservative (P10)"
              />
              {/* Predicted line */}
              <Area
                type="monotone"
                dataKey="predicted"
                stroke="#3b82f6"
                strokeWidth={2}
                fill="#3b82f6"
                fillOpacity={0.12}
                name="Expected Balance"
                dot={false}
                activeDot={{ r: 4 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
});
