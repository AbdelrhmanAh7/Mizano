'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import Link from 'next/link';
import { useFormatter, useTranslations } from 'next-intl';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { ReportFilters } from '@/components/reports/report-filters';
import { ReportLoadError } from '@/components/reports/report-load-error';
import { useBalanceSheetReport, formatCurrency, ReportAccount } from '@/lib/hooks/use-reports';

export default function BalanceSheetReportPage() {
  const t = useTranslations('reports');
  const formatter = useFormatter();
  const [asOfDate, setAsOfDate] = useState(new Date());

  const {
    data: report,
    isLoading,
    isError,
    refetch,
  } = useBalanceSheetReport(format(asOfDate, 'yyyy-MM-dd'));

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

  const assets = Array.isArray(report?.assets) ? report.assets : [];
  const liabilities = Array.isArray(report?.liabilities) ? report.liabilities : [];
  const equity = Array.isArray(report?.equity) ? report.equity : [];
  const totalAssets = report?.totalAssets ?? 0;
  // Exact comparison done by the API; never compare floats here.
  const isBalanced = report?.isBalanced ?? false;
  const totalLiabilities = report?.totalLiabilities ?? 0;
  const totalEquity = report?.totalEquity ?? 0;
  const hasData = assets.length > 0 || liabilities.length > 0 || equity.length > 0;

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
          <h1 className="text-3xl font-bold tracking-tight">{t('balanceSheet.title')}</h1>
          <p className="text-muted-foreground">
            {t('asOf', {
              date: formatter.dateTime(asOfDate, {
                month: 'long',
                day: 'numeric',
                year: 'numeric',
              }),
            })}
          </p>
        </div>
      </div>

      {/* Filters */}
      <ReportFilters
        asOfDate={asOfDate}
        onAsOfDateChange={setAsOfDate}
        showDateRange={false}
        showAsOfDate
      />

      {isError ? (
        <ReportLoadError onRetry={() => void refetch()} />
      ) : !hasData ? (
        <Card>
          <CardContent className="pt-6 text-center text-muted-foreground">
            {t('balanceSheet.empty')}
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Summary */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">{t('balanceSheet.totalAssets')}</p>
                <p className="text-2xl font-bold font-mono">
                  {formatCurrency(totalAssets, currencyCode)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">
                  {t('balanceSheet.totalLiabilities')}
                </p>
                <p className="text-2xl font-bold font-mono">
                  {formatCurrency(totalLiabilities, currencyCode)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">{t('balanceSheet.totalEquity')}</p>
                <p className="text-2xl font-bold font-mono">
                  {formatCurrency(totalEquity, currencyCode)}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Report */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Assets */}
            <Card>
              <CardHeader>
                <CardTitle>{t('balanceSheet.assets')}</CardTitle>
              </CardHeader>
              <CardContent>
                {assets.map((account: ReportAccount) => renderAccountRow(account))}
                <div className="flex justify-between py-3 border-t-2 font-bold">
                  <span>{t('balanceSheet.totalAssets')}</span>
                  <span className="font-mono">{formatCurrency(totalAssets, currencyCode)}</span>
                </div>
              </CardContent>
            </Card>

            {/* Liabilities & Equity */}
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>{t('balanceSheet.liabilities')}</CardTitle>
                </CardHeader>
                <CardContent>
                  {liabilities.map((account: ReportAccount) => renderAccountRow(account))}
                  <div className="flex justify-between py-3 border-t-2 font-bold">
                    <span>{t('balanceSheet.totalLiabilities')}</span>
                    <span className="font-mono">
                      {formatCurrency(totalLiabilities, currencyCode)}
                    </span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>{t('balanceSheet.equity')}</CardTitle>
                </CardHeader>
                <CardContent>
                  {equity.map((account: ReportAccount) => renderAccountRow(account))}
                  <div className="flex justify-between py-3 border-t-2 font-bold">
                    <span>{t('balanceSheet.totalEquity')}</span>
                    <span className="font-mono">{formatCurrency(totalEquity, currencyCode)}</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Balance Check */}
          <Card
            className={cn(
              'border-2',
              isBalanced ? 'border-success bg-success/10' : 'border-destructive bg-destructive/10',
            )}
          >
            <CardContent className="pt-6">
              <div className="flex justify-between items-center">
                <span className="font-bold">{t('balanceSheet.totalLiabilitiesAndEquity')}</span>
                <span className="text-xl font-bold font-mono">
                  {formatCurrency(report?.totalLiabilitiesAndEquity ?? '0', currencyCode)}
                </span>
              </div>
              <p className={cn('text-sm mt-2', isBalanced ? 'text-success' : 'text-destructive')}>
                {isBalanced ? t('balanceSheet.balanced') : t('balanceSheet.notBalanced')}
              </p>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
