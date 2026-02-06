'use client';

import { useState } from 'react';
import Link from 'next/link';
import { format, addMonths, subMonths } from 'date-fns';
import { ArrowLeft, TrendingUp, Target, BarChart3 } from 'lucide-react';
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
import { Badge } from '@/components/ui/badge';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  LineChart,
  Line,
} from 'recharts';
import { useRevenueForecast, formatCurrency } from '@/lib/hooks/use-ai';

export default function RevenueForecastPage() {
  const [months, setMonths] = useState<number>(6);
  const { data, isLoading } = useRevenueForecast(months);

  // Mock data combining historical and predicted
  const today = new Date();
  const mockData = [
    // Historical (past 6 months)
    ...Array.from({ length: 6 }, (_, i) => {
      const date = subMonths(today, 6 - i);
      const base = 80000 + Math.random() * 30000;
      return {
        date: format(date, 'yyyy-MM'),
        label: format(date, 'MMM yyyy'),
        actualRevenue: base,
        predictedRevenue: null,
        isHistorical: true,
      };
    }),
    // Predicted (future months)
    ...Array.from({ length: months }, (_, i) => {
      const date = addMonths(today, i);
      const base = 90000 + Math.random() * 40000 + i * 2000; // slight growth trend
      return {
        date: format(date, 'yyyy-MM'),
        label: format(date, 'MMM yyyy'),
        actualRevenue: null,
        predictedRevenue: base,
        isHistorical: false,
      };
    }),
  ];

  const forecastData = data?.data || mockData;

  // Calculate summary
  const historicalData = forecastData.filter((d: any) => d.isHistorical);
  const predictedData = forecastData.filter((d: any) => !d.isHistorical);

  const avgHistorical = historicalData.reduce((sum: number, d: any) => sum + (d.actualRevenue || 0), 0) / historicalData.length;
  const avgPredicted = predictedData.reduce((sum: number, d: any) => sum + (d.predictedRevenue || 0), 0) / predictedData.length;
  const totalPredicted = predictedData.reduce((sum: number, d: any) => sum + (d.predictedRevenue || 0), 0);
  const growthRate = ((avgPredicted - avgHistorical) / avgHistorical) * 100;

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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/ai-insights">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Revenue Forecast</h1>
            <p className="text-muted-foreground">
              AI-powered revenue predictions based on historical data
            </p>
          </div>
        </div>
        <Select value={months.toString()} onValueChange={(v) => setMonths(parseInt(v))}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="3">3 Months</SelectItem>
            <SelectItem value="6">6 Months</SelectItem>
            <SelectItem value="12">12 Months</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <BarChart3 className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Avg Historical</p>
                <p className="text-2xl font-bold font-mono">
                  {formatCurrency(avgHistorical)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 rounded-lg">
                <Target className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Avg Predicted</p>
                <p className="text-2xl font-bold font-mono">
                  {formatCurrency(avgPredicted)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className={growthRate >= 0 ? 'bg-green-50' : 'bg-red-50'}>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${growthRate >= 0 ? 'bg-green-100' : 'bg-red-100'}`}>
                <TrendingUp className={`h-5 w-5 ${growthRate >= 0 ? 'text-green-600' : 'text-red-600'}`} />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Growth Rate</p>
                <p className={`text-2xl font-bold ${growthRate >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {growthRate >= 0 ? '+' : ''}{growthRate.toFixed(1)}%
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Total Predicted</p>
            <p className="text-2xl font-bold font-mono">
              {formatCurrency(totalPredicted)}
            </p>
            <p className="text-xs text-muted-foreground">
              Next {months} months
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Combined Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Revenue Trend</CardTitle>
          <CardDescription>
            Historical revenue vs AI predictions
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[400px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={forecastData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                <YAxis
                  tick={{ fontSize: 12 }}
                  tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
                />
                <Tooltip formatter={(value: number) => formatCurrency(value)} />
                <Legend />
                <Bar
                  dataKey="actualRevenue"
                  fill="#3b82f6"
                  name="Actual Revenue"
                  radius={[4, 4, 0, 0]}
                />
                <Bar
                  dataKey="predictedRevenue"
                  fill="#8b5cf6"
                  name="Predicted Revenue"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Monthly Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle>Predicted Monthly Revenue</CardTitle>
          <CardDescription>
            Detailed breakdown of revenue predictions
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {predictedData.map((month: any, index: number) => (
              <div key={month.date} className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                <div className="flex items-center gap-4">
                  <div className="text-center min-w-[60px]">
                    <p className="text-lg font-bold">{format(new Date(month.date + '-01'), 'MMM')}</p>
                    <p className="text-xs text-muted-foreground">{format(new Date(month.date + '-01'), 'yyyy')}</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold font-mono">
                      {formatCurrency(month.predictedRevenue)}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {index === 0 ? 'This month' : `In ${index} month${index > 1 ? 's' : ''}`}
                    </p>
                  </div>
                </div>
                <Badge
                  variant="outline"
                  className={
                    month.predictedRevenue > avgHistorical * 1.1
                      ? 'bg-green-100 text-green-800'
                      : month.predictedRevenue < avgHistorical * 0.9
                      ? 'bg-red-100 text-red-800'
                      : 'bg-gray-100 text-gray-800'
                  }
                >
                  {month.predictedRevenue > avgHistorical * 1.1
                    ? 'Above Average'
                    : month.predictedRevenue < avgHistorical * 0.9
                    ? 'Below Average'
                    : 'On Track'}
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Factors */}
      <Card>
        <CardHeader>
          <CardTitle>Key Factors in Prediction</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 bg-green-50 rounded-lg">
              <h4 className="font-semibold text-green-800 mb-2">Positive Factors</h4>
              <ul className="space-y-1 text-sm text-green-700">
                <li>• Increasing customer acquisition rate</li>
                <li>• Higher average transaction value trend</li>
                <li>• Seasonal peak approaching</li>
                <li>• Low customer churn rate</li>
              </ul>
            </div>
            <div className="p-4 bg-orange-50 rounded-lg">
              <h4 className="font-semibold text-orange-800 mb-2">Risk Factors</h4>
              <ul className="space-y-1 text-sm text-orange-700">
                <li>• Market volatility</li>
                <li>• Competitor pricing changes</li>
                <li>• Economic uncertainty</li>
                <li>• Supply chain challenges</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
