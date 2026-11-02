'use client';

import { useState } from 'react';
import { format, startOfYear, endOfMonth } from 'date-fns';
import { useTranslations } from 'next-intl';
import { TrendingUp, TrendingDown, DollarSign } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { ReportFilters } from '@/components/reports/report-filters';
import {
  ReportPageHeader,
  ReportPageSkeleton,
  useReportDateLabels,
} from '@/components/reports/report-page';
import { useCashFlowReport } from '@/lib/hooks/use-reports';
import { useMoneyFormatter } from '@/lib/hooks/use-money-formatter';

interface CashFlowItem {
  key?: string;
  name?: string;
  description?: string;
  amount: number;
}

export default function CashFlowReportPage() {
  // Report figures are ledger amounts, in the organization base currency (audit B5).
  const formatCurrency = useMoneyFormatter();
  const t = useTranslations('reports');
  const dateLabels = useReportDateLabels();
  const [dateRange, setDateRange] = useState({
    startDate: startOfYear(new Date()),
    endDate: endOfMonth(new Date()),
  });

  const { data: report, isLoading } = useCashFlowReport({
    startDate: format(dateRange.startDate, 'yyyy-MM-dd'),
    endDate: format(dateRange.endDate, 'yyyy-MM-dd'),
  });

  if (isLoading) {
    return (
      <ReportPageSkeleton>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
        <Skeleton className="h-96" />
      </ReportPageSkeleton>
    );
  }

  const safeSection = (s: { items?: CashFlowItem[]; total?: number } | undefined | null) => ({
    items: Array.isArray(s?.items) ? s.items : ([] as CashFlowItem[]),
    total: s?.total ?? 0,
  });
  const data = {
    operatingActivities: safeSection(report?.operatingActivities),
    investingActivities: safeSection(report?.investingActivities),
    financingActivities: safeSection(report?.financingActivities),
    netCashFlow: report?.netCashFlow ?? 0,
    openingBalance: report?.openingBalance ?? 0,
    closingBalance: report?.closingBalance ?? 0,
  };

  const renderSection = (title: string, section: { items: CashFlowItem[]; total: number }) => (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {section.items.length === 0 ? (
          <p className="text-center py-4 text-muted-foreground text-sm">{t('cashFlow.noItems')}</p>
        ) : (
          <div className="space-y-2">
            {section.items.map((item: CashFlowItem, i: number) => (
              <div key={i} className="flex justify-between py-1.5 border-b last:border-0">
                <span className="text-sm">
                  {item.key ? t(`cashFlow.lines.${item.key}`) : item.name || item.description}
                </span>
                <span
                  className={cn(
                    'text-sm font-mono font-medium',
                    item.amount >= 0 ? 'text-success' : 'text-destructive',
                  )}
                >
                  {formatCurrency(Math.abs(item.amount))}
                </span>
              </div>
            ))}
          </div>
        )}
        <div className="flex justify-between pt-3 mt-3 border-t font-semibold">
          <span>{t('cashFlow.sectionTotal')}</span>
          <span
            className={cn('font-mono', section.total >= 0 ? 'text-success' : 'text-destructive')}
          >
            {formatCurrency(Math.abs(section.total))}
          </span>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      <ReportPageHeader
        title={t('cashFlow.title')}
        subtitle={<>{dateLabels.period(dateRange.startDate, dateRange.endDate)}</>}
      />

      <ReportFilters dateRange={dateRange} onDateRangeChange={setDateRange} showDateRange />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <TrendingUp className="h-4 w-4" />
              {t('cashFlow.openingBalance')}
            </div>
            <p className="text-2xl font-bold font-mono">{formatCurrency(data.openingBalance)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <DollarSign className="h-4 w-4" />
              {t('cashFlow.netCashFlow')}
            </div>
            <p
              className={cn(
                'text-2xl font-bold font-mono',
                data.netCashFlow >= 0 ? 'text-success' : 'text-destructive',
              )}
            >
              {data.netCashFlow >= 0 ? '+' : '-'}
              {formatCurrency(Math.abs(data.netCashFlow))}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <TrendingDown className="h-4 w-4" />
              {t('cashFlow.closingBalance')}
            </div>
            <p className="text-2xl font-bold font-mono">{formatCurrency(data.closingBalance)}</p>
          </CardContent>
        </Card>
      </div>

      {renderSection(t('cashFlow.operatingActivities'), data.operatingActivities)}
      {renderSection(t('cashFlow.investingActivities'), data.investingActivities)}
      {renderSection(t('cashFlow.financingActivities'), data.financingActivities)}
    </div>
  );
}
