'use client';

import { useState } from 'react';
import { format, startOfYear, endOfMonth } from 'date-fns';
import Link from 'next/link';
import { useFormatter, useTranslations } from 'next-intl';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { ReportFilters } from '@/components/reports/report-filters';
import { ReportLoadError } from '@/components/reports/report-load-error';
import { useProfitLossReport, formatCurrency, ReportAccount } from '@/lib/hooks/use-reports';

export default function ProfitLossReportPage() {
  const t = useTranslations('reports');
  const formatter = useFormatter();
  const today = new Date();
  const [dateRange, setDateRange] = useState({
    startDate: startOfYear(today),
    endDate: endOfMonth(today),
  });

  const {
    data: report,
    isLoading,
    isError,
    refetch,
  } = useProfitLossReport({
    startDate: format(dateRange.startDate, 'yyyy-MM-dd'),
    endDate: format(dateRange.endDate, 'yyyy-MM-dd'),
  });

  const currencyCode = report?.currencyCode;

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
        <span className="font-mono">{formatCurrency(account.balance, currencyCode)}</span>
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

  const income = Array.isArray(report?.income) ? report.income : [];
  const expenses = Array.isArray(report?.expenses) ? report.expenses : [];
  const totalIncome = report?.totalIncome ?? 0;
  const totalExpenses = report?.totalExpenses ?? 0;
  const netProfit = report?.netProfit ?? 0;
  const hasData = income.length > 0 || expenses.length > 0;

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
          <h1 className="text-3xl font-bold tracking-tight">{t('profitLoss.title')}</h1>
          <p className="text-muted-foreground">
            {formatter.dateTime(dateRange.startDate, {
              month: 'long',
              day: 'numeric',
              year: 'numeric',
            })}{' '}
            -{' '}
            {formatter.dateTime(dateRange.endDate, {
              month: 'long',
              day: 'numeric',
              year: 'numeric',
            })}
          </p>
        </div>
      </div>

      {/* Filters */}
      <ReportFilters dateRange={dateRange} onDateRangeChange={setDateRange} showDateRange />

      {isError ? (
        <ReportLoadError onRetry={() => void refetch()} />
      ) : !hasData ? (
        <Card>
          <CardContent className="pt-6 text-center text-muted-foreground">
            {t('profitLoss.empty')}
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Summary */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">{t('profitLoss.revenue')}</p>
                <p className="text-2xl font-bold font-mono text-green-600">
                  {formatCurrency(totalIncome, currencyCode)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">{t('profitLoss.operatingExpenses')}</p>
                <p className="text-2xl font-bold font-mono text-red-600">
                  {formatCurrency(totalExpenses, currencyCode)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">{t('profitLoss.netProfit')}</p>
                <p
                  className={cn(
                    'text-2xl font-bold font-mono',
                    netProfit >= 0 ? 'text-green-600' : 'text-red-600',
                  )}
                >
                  {formatCurrency(netProfit, currencyCode)}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Report */}
          <Card>
            <CardHeader>
              <CardTitle>{t('profitLoss.revenue')}</CardTitle>
            </CardHeader>
            <CardContent>
              {income.map((account: ReportAccount) => renderAccountRow(account))}
              <div className="flex justify-between py-3 border-t-2 font-bold">
                <span>{t('profitLoss.revenue')}</span>
                <span className="font-mono text-green-600">
                  {formatCurrency(totalIncome, currencyCode)}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('profitLoss.operatingExpenses')}</CardTitle>
            </CardHeader>
            <CardContent>
              {expenses.map((account: ReportAccount) => renderAccountRow(account))}
              <div className="flex justify-between py-3 border-t-2 font-bold">
                <span>{t('profitLoss.operatingExpenses')}</span>
                <span className="font-mono text-red-600">
                  {formatCurrency(totalExpenses, currencyCode)}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-primary/5">
            <CardContent className="pt-6">
              <div className="flex justify-between items-center">
                <span className="text-xl font-bold">{t('profitLoss.netProfit')}</span>
                <span
                  className={cn(
                    'text-3xl font-bold font-mono',
                    netProfit >= 0 ? 'text-green-600' : 'text-red-600',
                  )}
                >
                  {formatCurrency(netProfit, currencyCode)}
                </span>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
