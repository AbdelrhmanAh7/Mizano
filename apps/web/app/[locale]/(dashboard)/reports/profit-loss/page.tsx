'use client';

import { useState } from 'react';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { ReportFilters } from '@/components/reports/report-filters';
import { useProfitLossReport, formatCurrency, ReportAccount } from '@/lib/hooks/use-reports';

export default function ProfitLossReportPage() {
  const today = new Date();
  const [dateRange, setDateRange] = useState({
    startDate: startOfMonth(today),
    endDate: endOfMonth(today),
  });

  const { data: report, isLoading } = useProfitLossReport({
    startDate: format(dateRange.startDate, 'yyyy-MM-dd'),
    endDate: format(dateRange.endDate, 'yyyy-MM-dd'),
  });

  const renderAccountRow = (account: ReportAccount, level = 0) => (
    <div key={account.id}>
      <div
        className={cn(
          'flex justify-between py-2 border-b',
          level === 0 && 'font-medium',
          level > 0 && 'text-sm',
        )}
        style={{ paddingLeft: `${level * 24}px` }}
      >
        <span className="flex items-center gap-2">
          <span className="text-muted-foreground font-mono">{account.code}</span>
          {account.name}
        </span>
        <span className="font-mono">{formatCurrency(account.balance)}</span>
      </div>
      {account.children?.map((child) => renderAccountRow(child, level + 1))}
    </div>
  );

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-12 w-full max-w-md" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  // Mock data for display
  const mockReport = report || {
    income: [
      { id: '1', code: '4000', name: 'Revenue', type: 'INCOME', balance: 125000 },
      { id: '2', code: '4100', name: 'Other Income', type: 'INCOME', balance: 5000 },
    ],
    expenses: [
      { id: '3', code: '5000', name: 'Cost of Goods Sold', type: 'EXPENSE', balance: 45000 },
      { id: '4', code: '6000', name: 'Operating Expenses', type: 'EXPENSE', balance: 35000 },
      { id: '5', code: '6100', name: 'Salaries', type: 'EXPENSE', balance: 25000 },
    ],
    totalIncome: 130000,
    totalExpenses: 105000,
    netProfit: 25000,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/reports">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Profit & Loss Statement</h1>
          <p className="text-muted-foreground">
            {format(dateRange.startDate, 'MMMM d, yyyy')} -{' '}
            {format(dateRange.endDate, 'MMMM d, yyyy')}
          </p>
        </div>
      </div>

      {/* Filters */}
      <ReportFilters dateRange={dateRange} onDateRangeChange={setDateRange} showDateRange />

      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Total Income</p>
            <p className="text-2xl font-bold font-mono text-green-600">
              {formatCurrency(mockReport.totalIncome)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Total Expenses</p>
            <p className="text-2xl font-bold font-mono text-red-600">
              {formatCurrency(mockReport.totalExpenses)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Net Profit</p>
            <p
              className={cn(
                'text-2xl font-bold font-mono',
                mockReport.netProfit >= 0 ? 'text-green-600' : 'text-red-600',
              )}
            >
              {formatCurrency(mockReport.netProfit)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Report */}
      <Card>
        <CardHeader>
          <CardTitle>Income</CardTitle>
        </CardHeader>
        <CardContent>
          {mockReport.income.map((account: any) => renderAccountRow(account))}
          <div className="flex justify-between py-3 border-t-2 font-bold">
            <span>Total Income</span>
            <span className="font-mono text-green-600">
              {formatCurrency(mockReport.totalIncome)}
            </span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Expenses</CardTitle>
        </CardHeader>
        <CardContent>
          {mockReport.expenses.map((account: any) => renderAccountRow(account))}
          <div className="flex justify-between py-3 border-t-2 font-bold">
            <span>Total Expenses</span>
            <span className="font-mono text-red-600">
              {formatCurrency(mockReport.totalExpenses)}
            </span>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-primary/5">
        <CardContent className="pt-6">
          <div className="flex justify-between items-center">
            <span className="text-xl font-bold">Net Profit</span>
            <span
              className={cn(
                'text-3xl font-bold font-mono',
                mockReport.netProfit >= 0 ? 'text-green-600' : 'text-red-600',
              )}
            >
              {formatCurrency(mockReport.netProfit)}
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
