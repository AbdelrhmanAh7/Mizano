'use client';

import { useState } from 'react';
import { format, startOfYear, endOfMonth } from 'date-fns';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ArrowLeft, TrendingUp, TrendingDown, DollarSign } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { ReportFilters } from '@/components/reports/report-filters';
import { useCashFlowReport, formatCurrency } from '@/lib/hooks/use-reports';

interface CashFlowItem {
  name?: string;
  description?: string;
  amount: number;
}

export default function CashFlowReportPage() {
  const t = useTranslations('reports');
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
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-12 w-full max-w-md" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
        <Skeleton className="h-96" />
      </div>
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
          <p className="text-center py-4 text-muted-foreground text-sm">No items</p>
        ) : (
          <div className="space-y-2">
            {section.items.map((item: CashFlowItem, i: number) => (
              <div key={i} className="flex justify-between py-1.5 border-b last:border-0">
                <span className="text-sm">{item.name || item.description}</span>
                <span
                  className={cn(
                    'text-sm font-mono font-medium',
                    item.amount >= 0 ? 'text-green-600' : 'text-red-600',
                  )}
                >
                  {formatCurrency(Math.abs(item.amount))}
                </span>
              </div>
            ))}
          </div>
        )}
        <div className="flex justify-between pt-3 mt-3 border-t font-semibold">
          <span>Total</span>
          <span className={cn('font-mono', section.total >= 0 ? 'text-green-600' : 'text-red-600')}>
            {formatCurrency(Math.abs(section.total))}
          </span>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/reports">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('cashFlow.title')}</h1>
          <p className="text-muted-foreground">
            {format(dateRange.startDate, 'MMMM d')} - {format(dateRange.endDate, 'MMMM d, yyyy')}
          </p>
        </div>
      </div>

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
                data.netCashFlow >= 0 ? 'text-green-600' : 'text-red-600',
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
