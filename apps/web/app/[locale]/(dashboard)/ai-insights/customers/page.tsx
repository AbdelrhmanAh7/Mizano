'use client';

import Link from 'next/link';
import { ArrowLeft, Users, TrendingUp, DollarSign, Star, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts';
import { useCustomerAnalysis, formatCurrency } from '@/lib/hooks/use-ai';

export default function CustomerAnalysisPage() {
  const { data, isLoading } = useCustomerAnalysis();

  const analysis = data?.data;

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

  if (!analysis) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/ai-insights">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Customer Analysis</h1>
            <p className="text-muted-foreground">AI-powered customer segmentation and insights</p>
          </div>
        </div>
        <Card>
          <CardContent className="pt-6 text-center text-muted-foreground">
            No customer analysis data available yet. Add customers and transactions to generate
            insights.
          </CardContent>
        </Card>
      </div>
    );
  }

  const segments = Array.isArray(analysis.segments) ? analysis.segments : [];
  const topCustomers = Array.isArray(analysis.topCustomers) ? analysis.topCustomers : [];
  const atRiskCustomers = Array.isArray(analysis.atRiskCustomers) ? analysis.atRiskCustomers : [];
  const revenueBySegment = Array.isArray(analysis.revenueBySegment)
    ? analysis.revenueBySegment
    : [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/ai-insights">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Customer Analysis</h1>
          <p className="text-muted-foreground">AI-powered customer segmentation and insights</p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Users className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Customers</p>
                <p className="text-2xl font-bold">{analysis.summary.totalCustomers}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <TrendingUp className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Active</p>
                <p className="text-2xl font-bold text-green-600">
                  {analysis.summary.activeCustomers}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 rounded-lg">
                <DollarSign className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Avg Lifetime Value</p>
                <p className="text-2xl font-bold font-mono">
                  {formatCurrency(analysis.summary.avgLifetimeValue)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className={analysis.summary.churnRate > 5 ? 'bg-red-50' : 'bg-green-50'}>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Churn Rate</p>
            <p
              className={`text-2xl font-bold ${analysis.summary.churnRate > 5 ? 'text-red-600' : 'text-green-600'}`}
            >
              {analysis.summary.churnRate}%
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Segmentation Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Customer Segments</CardTitle>
            <CardDescription>Distribution by segment</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={segments}
                    dataKey="count"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  >
                    {segments.map((segment: { color: string }, index: number) => (
                      <Cell key={index} fill={segment.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Revenue by Segment</CardTitle>
            <CardDescription>Current vs previous period</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={revenueBySegment} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                  <YAxis type="category" dataKey="segment" width={80} tick={{ fontSize: 12 }} />
                  <Tooltip formatter={(value: number) => formatCurrency(value)} />
                  <Legend />
                  <Bar dataKey="current" fill="#3b82f6" name="Current" />
                  <Bar dataKey="previous" fill="#d1d5db" name="Previous" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Top Customers */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Star className="h-5 w-5 text-yellow-500" />
            Top Customers
          </CardTitle>
          <CardDescription>Highest revenue customers</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {topCustomers.map(
              (
                customer: {
                  id: string;
                  name: string;
                  segment: string;
                  revenue: number;
                  growth: number;
                },
                index: number,
              ) => (
                <div
                  key={customer.id}
                  className="flex items-center justify-between p-4 bg-muted/50 rounded-lg"
                >
                  <div className="flex items-center gap-4">
                    <div className="text-2xl font-bold text-muted-foreground w-8">#{index + 1}</div>
                    <Avatar>
                      <AvatarFallback>
                        {customer.name
                          .split(' ')
                          .map((n: string) => n[0])
                          .join('')}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-medium">{customer.name}</p>
                      <Badge variant="outline" className="mt-1">
                        {customer.segment}
                      </Badge>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xl font-bold font-mono">
                      {formatCurrency(customer.revenue)}
                    </p>
                    <p
                      className={`text-sm ${customer.growth >= 0 ? 'text-green-600' : 'text-red-600'}`}
                    >
                      {customer.growth >= 0 ? '+' : ''}
                      {customer.growth}% growth
                    </p>
                  </div>
                </div>
              ),
            )}
          </div>
        </CardContent>
      </Card>

      {/* At-Risk Customers */}
      <Card className="border-orange-200">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-orange-700">
            <AlertTriangle className="h-5 w-5" />
            At-Risk Customers
          </CardTitle>
          <CardDescription>Customers that may need attention to prevent churn</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {atRiskCustomers.map(
              (customer: {
                id: string;
                name: string;
                lastOrder: string;
                reason: string;
                riskScore: number;
              }) => (
                <div
                  key={customer.id}
                  className="flex items-center justify-between p-4 bg-orange-50 rounded-lg"
                >
                  <div className="flex items-center gap-4">
                    <Avatar>
                      <AvatarFallback className="bg-orange-200 text-orange-800">
                        {customer.name
                          .split(' ')
                          .map((n: string) => n[0])
                          .join('')}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-medium">{customer.name}</p>
                      <p className="text-sm text-muted-foreground">
                        Last order: {customer.lastOrder}
                      </p>
                      <p className="text-sm text-orange-700">Reason: {customer.reason}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-muted-foreground mb-1">Risk Score</p>
                    <div className="flex items-center gap-2">
                      <Progress value={customer.riskScore} className="w-24 h-2" />
                      <span className="font-bold text-orange-700">{customer.riskScore}%</span>
                    </div>
                    <Button variant="outline" size="sm" className="mt-2">
                      Take Action
                    </Button>
                  </div>
                </div>
              ),
            )}
          </div>
        </CardContent>
      </Card>

      {/* Recommendations */}
      <Card>
        <CardHeader>
          <CardTitle>AI Recommendations</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 bg-green-50 rounded-lg border border-green-200">
              <h4 className="font-semibold text-green-800 mb-2">Growth Opportunities</h4>
              <ul className="space-y-2 text-sm text-green-700">
                <li>• Upsell premium services to 23 Growing segment customers</li>
                <li>• Cross-sell complementary products to High Value segment</li>
                <li>• Launch referral program targeting satisfied customers</li>
              </ul>
            </div>
            <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
              <h4 className="font-semibold text-blue-800 mb-2">Retention Actions</h4>
              <ul className="space-y-2 text-sm text-blue-700">
                <li>• Schedule check-in calls with 3 at-risk customers</li>
                <li>• Send re-engagement campaign to dormant segment</li>
                <li>• Offer loyalty discounts to declining accounts</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
