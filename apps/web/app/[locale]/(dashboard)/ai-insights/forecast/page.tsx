'use client';

import { useState } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { ArrowLeft, TrendingUp, TrendingDown, DollarSign, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  ComposedChart,
  Legend,
} from 'recharts';
import { useCashFlowForecast, formatCurrency, CashFlowForecast } from '@/lib/hooks/use-ai';

export default function CashFlowForecastPage() {
  const [days, setDays] = useState<number>(30);
  const { data, isLoading } = useCashFlowForecast(days);

  const forecast: CashFlowForecast[] = Array.isArray(data?.data) ? data.data : [];

  // Calculate summary
  const totalInflow = forecast.reduce((sum, f) => sum + f.predictedInflow, 0);
  const totalOutflow = forecast.reduce((sum, f) => sum + f.predictedOutflow, 0);
  const netCashFlow = totalInflow - totalOutflow;
  const endingBalance = forecast[forecast.length - 1]?.predictedBalance || 0;
  const lowestBalance = forecast.length > 0 ? Math.min(...forecast.map((f) => f.lowerBound)) : 0;

  const chartData = forecast.map((f) => ({
    date: format(new Date(f.date), 'MMM d'),
    balance: f.predictedBalance,
    lowerBound: f.lowerBound,
    upperBound: f.upperBound,
    inflow: f.predictedInflow,
    outflow: f.predictedOutflow,
  }));

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-64" />
        <div className="grid grid-cols-4 gap-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (forecast.length === 0) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" aria-label="Go back" asChild>
              <Link href="/ai-insights">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Cash Flow Forecast</h1>
              <p className="text-muted-foreground">AI-powered prediction of future cash flows</p>
            </div>
          </div>
          <Select value={days.toString()} onValueChange={(v) => setDays(parseInt(v))}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">7 Days</SelectItem>
              <SelectItem value="14">14 Days</SelectItem>
              <SelectItem value="30">30 Days</SelectItem>
              <SelectItem value="60">60 Days</SelectItem>
              <SelectItem value="90">90 Days</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Card>
          <CardContent className="pt-6 text-center text-muted-foreground">
            No cash flow forecast data available yet. Add more transaction history to generate
            predictions.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" aria-label="Go back" asChild>
            <Link href="/ai-insights">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Cash Flow Forecast</h1>
            <p className="text-muted-foreground">AI-powered prediction of future cash flows</p>
          </div>
        </div>
        <Select value={days.toString()} onValueChange={(v) => setDays(parseInt(v))}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">7 Days</SelectItem>
            <SelectItem value="14">14 Days</SelectItem>
            <SelectItem value="30">30 Days</SelectItem>
            <SelectItem value="60">60 Days</SelectItem>
            <SelectItem value="90">90 Days</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <TrendingUp className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Inflow</p>
                <p className="text-2xl font-bold font-mono text-green-600">
                  {formatCurrency(totalInflow)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-100 rounded-lg">
                <TrendingDown className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Outflow</p>
                <p className="text-2xl font-bold font-mono text-red-600">
                  {formatCurrency(totalOutflow)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className={netCashFlow >= 0 ? 'bg-green-50' : 'bg-red-50'}>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Net Cash Flow</p>
            <p
              className={`text-2xl font-bold font-mono ${netCashFlow >= 0 ? 'text-green-600' : 'text-red-600'}`}
            >
              {netCashFlow >= 0 ? '+' : ''}
              {formatCurrency(netCashFlow)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <DollarSign className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Ending Balance</p>
                <p className="text-2xl font-bold font-mono">{formatCurrency(endingBalance)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Alert if lowest balance is concerning */}
      {lowestBalance < 10000 && (
        <Card className="border-yellow-200 bg-yellow-50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-6 w-6 text-yellow-600" />
              <div>
                <p className="font-semibold text-yellow-800">Cash Flow Warning</p>
                <p className="text-sm text-yellow-700">
                  Your projected cash balance may drop to {formatCurrency(lowestBalance)} during
                  this period. Consider delaying non-essential expenses or accelerating receivables
                  collection.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Balance Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Projected Cash Balance</CardTitle>
          <CardDescription>
            Predicted balance with confidence interval (shaded area)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[400px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                <YAxis
                  tick={{ fontSize: 12 }}
                  tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
                />
                <Tooltip
                  formatter={(value: number) => formatCurrency(value)}
                  labelFormatter={(label) => `Date: ${label}`}
                />
                <Legend />
                <Area
                  type="monotone"
                  dataKey="upperBound"
                  fill="#e0f2fe"
                  stroke="none"
                  name="Upper Bound"
                />
                <Area
                  type="monotone"
                  dataKey="lowerBound"
                  fill="#ffffff"
                  stroke="none"
                  name="Lower Bound"
                />
                <Line
                  type="monotone"
                  dataKey="balance"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={false}
                  name="Predicted Balance"
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Inflow/Outflow Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Cash Inflows vs Outflows</CardTitle>
          <CardDescription>Daily predicted cash movements</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                <YAxis
                  tick={{ fontSize: 12 }}
                  tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
                />
                <Tooltip formatter={(value: number) => formatCurrency(value)} />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="inflow"
                  stroke="#22c55e"
                  strokeWidth={2}
                  name="Inflow"
                />
                <Line
                  type="monotone"
                  dataKey="outflow"
                  stroke="#ef4444"
                  strokeWidth={2}
                  name="Outflow"
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Assumptions */}
      <Card>
        <CardHeader>
          <CardTitle>Forecast Assumptions</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li>• Based on historical transaction patterns from the last 12 months</li>
            <li>• Accounts for known upcoming invoices and bills</li>
            <li>• Includes seasonal adjustments based on previous years</li>
            <li>• Confidence interval represents 80% probability range</li>
            <li>• Does not account for unexpected large transactions</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
