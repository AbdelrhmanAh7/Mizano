'use client';

import { useState } from 'react';
import { format, startOfYear, endOfMonth } from 'date-fns';
import { useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { ReportFilters } from '@/components/reports/report-filters';
import {
  ReportAccountRow,
  ledgerHref,
  ReportPageHeader,
  ReportPageSkeleton,
  useReportDateLabels,
} from '@/components/reports/report-page';
import { MonthlySummaryCard } from '@/components/reports/monthly-summary-card';
import { useProfitLossReport, ReportAccount } from '@/lib/hooks/use-reports';
import { useMoneyFormatter } from '@/lib/hooks/use-money-formatter';

export default function ProfitLossReportPage() {
  // Report figures are ledger amounts, in the organization base currency (audit B5).
  const formatCurrency = useMoneyFormatter();
  const t = useTranslations('reports');
  const dateLabels = useReportDateLabels();
  const today = new Date();
  const [dateRange, setDateRange] = useState({
    startDate: startOfYear(today),
    endDate: endOfMonth(today),
  });

  const { data: report, isLoading } = useProfitLossReport({
    startDate: format(dateRange.startDate, 'yyyy-MM-dd'),
    endDate: format(dateRange.endDate, 'yyyy-MM-dd'),
  });

  // Each figure opens its account's ledger for the same period (#669).
  const hrefOf = (account: ReportAccount) =>
    account.id ? ledgerHref(account.id, dateRange.startDate, dateRange.endDate) : undefined;

  if (isLoading) {
    return <ReportPageSkeleton />;
  }

  const income = Array.isArray(report?.income) ? report.income : [];
  const expenses = Array.isArray(report?.expenses) ? report.expenses : [];
  const totalIncome = report?.totalIncome ?? 0;
  const totalExpenses = report?.totalExpenses ?? 0;
  const netProfit = report?.netProfit ?? 0;
  const hasData = income.length > 0 || expenses.length > 0;

  return (
    <div className="space-y-6">
      <ReportPageHeader
        title={t('profitLoss.title')}
        subtitle={dateLabels.period(dateRange.startDate, dateRange.endDate)}
      />

      {/* Filters */}
      <ReportFilters dateRange={dateRange} onDateRangeChange={setDateRange} showDateRange />

      <MonthlySummaryCard month={format(dateRange.endDate, 'yyyy-MM')} />

      {!hasData ? (
        <Card>
          <CardContent className="pt-6 text-center text-muted-foreground">
            {t('profitLoss.noData')}
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
                  {formatCurrency(totalIncome)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">{t('profitLoss.operatingExpenses')}</p>
                <p className="text-2xl font-bold font-mono text-red-600">
                  {formatCurrency(totalExpenses)}
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
                  {formatCurrency(netProfit)}
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
              {income.map((account: ReportAccount) => (
                <ReportAccountRow key={account.id} account={account} hrefOf={hrefOf} />
              ))}
              <div className="flex justify-between py-3 border-t-2 font-bold">
                <span>{t('profitLoss.revenue')}</span>
                <span className="font-mono text-green-600">{formatCurrency(totalIncome)}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('profitLoss.operatingExpenses')}</CardTitle>
            </CardHeader>
            <CardContent>
              {expenses.map((account: ReportAccount) => (
                <ReportAccountRow key={account.id} account={account} hrefOf={hrefOf} />
              ))}
              <div className="flex justify-between py-3 border-t-2 font-bold">
                <span>{t('profitLoss.operatingExpenses')}</span>
                <span className="font-mono text-red-600">{formatCurrency(totalExpenses)}</span>
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
                  {formatCurrency(netProfit)}
                </span>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
