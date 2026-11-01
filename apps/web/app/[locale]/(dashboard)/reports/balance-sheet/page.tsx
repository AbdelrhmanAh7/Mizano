'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import { useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { ReportFilters } from '@/components/reports/report-filters';
import {
  ReportAccountRow,
  ReportPageHeader,
  ReportPageSkeleton,
  useReportDateLabels,
} from '@/components/reports/report-page';
import { useBalanceSheetReport, ReportAccount } from '@/lib/hooks/use-reports';
import { useMoneyFormatter } from '@/lib/hooks/use-money-formatter';

/** Section rows the report transform adds (ids from use-reports), shown in the page language. */
const SECTION_KEYS: Record<string, string> = {
  'current-assets': 'currentAssets',
  'fixed-assets': 'fixedAssets',
  'current-liabilities': 'currentLiabilities',
  'long-term-liabilities': 'longTermLiabilities',
  'retained-earnings': 'retainedEarnings',
};

export default function BalanceSheetReportPage() {
  // Report figures are ledger amounts, in the organization base currency (audit B5).
  const formatCurrency = useMoneyFormatter();
  const t = useTranslations('reports');
  const dateLabels = useReportDateLabels();
  const [asOfDate, setAsOfDate] = useState(new Date());

  const { data: report, isLoading } = useBalanceSheetReport(format(asOfDate, 'yyyy-MM-dd'));

  const labelOf = (account: ReportAccount) =>
    SECTION_KEYS[account.id] ? t(`balanceSheet.${SECTION_KEYS[account.id]}`) : account.name;

  if (isLoading) {
    return <ReportPageSkeleton />;
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
      <ReportPageHeader title={t('balanceSheet.title')} subtitle={dateLabels.asOf(asOfDate)} />

      {/* Filters */}
      <ReportFilters
        asOfDate={asOfDate}
        onAsOfDateChange={setAsOfDate}
        showDateRange={false}
        showAsOfDate
      />

      {!hasData ? (
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
                <p className="text-2xl font-bold font-mono">{formatCurrency(totalAssets)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">
                  {t('balanceSheet.totalLiabilities')}
                </p>
                <p className="text-2xl font-bold font-mono">{formatCurrency(totalLiabilities)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">{t('balanceSheet.totalEquity')}</p>
                <p className="text-2xl font-bold font-mono">{formatCurrency(totalEquity)}</p>
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
                {assets.map((account: ReportAccount) => (
                  <ReportAccountRow key={account.id} account={account} labelOf={labelOf} />
                ))}
                <div className="flex justify-between py-3 border-t-2 font-bold">
                  <span>{t('balanceSheet.totalAssets')}</span>
                  <span className="font-mono">{formatCurrency(totalAssets)}</span>
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
                  {liabilities.map((account: ReportAccount) => (
                    <ReportAccountRow key={account.id} account={account} labelOf={labelOf} />
                  ))}
                  <div className="flex justify-between py-3 border-t-2 font-bold">
                    <span>{t('balanceSheet.totalLiabilities')}</span>
                    <span className="font-mono">{formatCurrency(totalLiabilities)}</span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>{t('balanceSheet.equity')}</CardTitle>
                </CardHeader>
                <CardContent>
                  {equity.map((account: ReportAccount) => (
                    <ReportAccountRow key={account.id} account={account} labelOf={labelOf} />
                  ))}
                  <div className="flex justify-between py-3 border-t-2 font-bold">
                    <span>{t('balanceSheet.totalEquity')}</span>
                    <span className="font-mono">{formatCurrency(totalEquity)}</span>
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
                  {formatCurrency(report?.totalLiabilitiesAndEquity ?? '0')}
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
