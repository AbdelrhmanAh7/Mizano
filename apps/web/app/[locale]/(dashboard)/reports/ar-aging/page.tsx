'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import Link from 'next/link';
import { useFormatter, useTranslations } from 'next-intl';
import { ArrowLeft, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { ReportFilters } from '@/components/reports/report-filters';
import { ReportLoadError } from '@/components/reports/report-load-error';
import {
  useARAgingReport,
  formatCurrency,
  getAgingBucketColor,
  AgingBucket,
} from '@/lib/hooks/use-reports';

export default function ARAgingReportPage() {
  const t = useTranslations('reports');
  const formatter = useFormatter();
  const [asOfDate, setAsOfDate] = useState(new Date());
  const [expandedBucket, setExpandedBucket] = useState<string | null>(null);

  const {
    data: report,
    isLoading,
    isError,
    refetch,
  } = useARAgingReport(format(asOfDate, 'yyyy-MM-dd'));
  // Report amounts are labelled with the currency the API returns, never a default.
  const currencyCode = report?.currencyCode;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-12 w-full max-w-md" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  const buckets = Array.isArray(report?.buckets) ? report.buckets : [];
  const total = report?.total ?? 0;
  const totalCount = report?.totalCount ?? 0;
  const hasData = buckets.length > 0;

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
          <h1 className="text-3xl font-bold tracking-tight">{t('arAging.title')}</h1>
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
            {t('arAging.empty')}
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Summary */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <Users className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">{t('arAging.total')}</p>
                    <p className="text-2xl font-bold font-mono">
                      {formatCurrency(total, currencyCode)}
                    </p>
                    {report && report.unappliedCredits > 0 && (
                      <p className="text-xs text-muted-foreground">
                        {t('agingUnappliedCredits', {
                          amount: formatCurrency(report.unappliedCredits, currencyCode),
                        })}
                      </p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">{t('arAging.outstandingInvoices')}</p>
                <p className="text-2xl font-bold">{totalCount}</p>
              </CardContent>
            </Card>
          </div>

          {/* Aging Buckets */}
          <Card>
            <CardHeader>
              <CardTitle>{t('agingSummary')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                {buckets.map((bucket: AgingBucket) => (
                  <button
                    key={bucket.range}
                    onClick={() =>
                      setExpandedBucket(expandedBucket === bucket.range ? null : bucket.range)
                    }
                    className={cn(
                      'p-4 rounded-lg border-2 text-left transition-colors',
                      expandedBucket === bucket.range
                        ? 'border-primary'
                        : 'border-transparent hover:border-primary/50',
                      getAgingBucketColor(bucket.range),
                    )}
                  >
                    <p className="text-sm font-medium">{t(`agingBuckets.${bucket.range}`)}</p>
                    <p className="text-xl font-bold font-mono mt-1">
                      {formatCurrency(bucket.amount, currencyCode)}
                    </p>
                    <p className="text-xs mt-1">
                      {t('arAging.invoiceCount', { count: bucket.count })}
                    </p>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Detail Table */}
          {expandedBucket && (
            <Card>
              <CardHeader>
                <CardTitle>
                  {t('arAging.bucketTitle', { bucket: t(`agingBuckets.${expandedBucket}`) })}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {buckets.find((b: AgingBucket) => b.range === expandedBucket)?.items?.length ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('arAging.invoiceNumber')}</TableHead>
                        <TableHead>{t('customer')}</TableHead>
                        <TableHead>{t('arAging.invoiceDate')}</TableHead>
                        <TableHead>{t('dueDate')}</TableHead>
                        <TableHead className="text-right">{t('amount')}</TableHead>
                        <TableHead className="text-right">{t('balanceDue')}</TableHead>
                        <TableHead className="text-center">{t('daysOverdue')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {buckets
                        .find((b: AgingBucket) => b.range === expandedBucket)
                        ?.items?.map(
                          (item: {
                            id: string;
                            number: string;
                            counterpartyName: string;
                            date: string;
                            dueDate: string;
                            amount: number;
                            balanceDue: number;
                            daysOverdue: number;
                          }) => (
                            <TableRow key={item.id}>
                              <TableCell>
                                <Link
                                  href={`/sales/invoices/${item.id}`}
                                  className="font-medium hover:text-blue-600 hover:underline"
                                >
                                  {item.number}
                                </Link>
                              </TableCell>
                              <TableCell>{item.counterpartyName}</TableCell>
                              <TableCell>
                                {formatter.dateTime(new Date(item.date), {
                                  month: 'long',
                                  day: 'numeric',
                                  year: 'numeric',
                                })}
                              </TableCell>
                              <TableCell>
                                {formatter.dateTime(new Date(item.dueDate), {
                                  month: 'long',
                                  day: 'numeric',
                                  year: 'numeric',
                                })}
                              </TableCell>
                              <TableCell className="text-right font-mono">
                                {formatCurrency(item.amount, currencyCode)}
                              </TableCell>
                              <TableCell className="text-right font-mono font-medium">
                                {formatCurrency(item.balanceDue, currencyCode)}
                              </TableCell>
                              <TableCell className="text-center">
                                <Badge
                                  variant="outline"
                                  className={cn(
                                    item.daysOverdue > 30
                                      ? 'bg-red-100 text-red-800'
                                      : item.daysOverdue > 0
                                        ? 'bg-yellow-100 text-yellow-800'
                                        : 'bg-green-100 text-green-800',
                                  )}
                                >
                                  {item.daysOverdue}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          ),
                        )}
                    </TableBody>
                  </Table>
                ) : (
                  <p className="text-center py-8 text-muted-foreground">
                    {t('arAging.emptyBucket')}
                  </p>
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
