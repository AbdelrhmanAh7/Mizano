'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { UseQueryResult } from '@tanstack/react-query';
import { Building2, LucideIcon, Users } from 'lucide-react';
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
import { cn } from '@/lib/utils';
import { ReportFilters } from '@/components/reports/report-filters';
import {
  ReportLoadError,
  ReportPageHeader,
  ReportPageSkeleton,
} from '@/components/reports/report-page';
import {
  AgingBucket,
  AgingReport,
  getAgingBucketColor,
  useAPAgingReport,
  useARAgingReport,
} from '@/lib/hooks/use-reports';
import { useMoneyFormatter } from '@/lib/hooks/use-money-formatter';
import { useDateFormatter } from '@/lib/hooks/use-date-locale';

/** What differs between the receivable (customers, invoices) and payable (vendors, bills) report. */
interface AgingSide {
  useReport: (asOfDate: string) => UseQueryResult<AgingReport>;
  /** The side's namespace in `reports` messages (labels, headers and empty states). */
  ns: 'arAging' | 'apAging';
  totalKey: string;
  partyKey: string;
  icon: LucideIcon;
  iconClassName: { box: string; icon: string };
  detailPath: string;
  /** Receivables hide the summary when empty; payables keep it and say so in the buckets card. */
  emptyPlacement: 'page' | 'buckets';
}

const AGING_SIDES: Record<'receivable' | 'payable', AgingSide> = {
  receivable: {
    useReport: useARAgingReport,
    ns: 'arAging',
    totalKey: 'total',
    partyKey: 'customer',
    icon: Users,
    iconClassName: { box: 'bg-blue-100', icon: 'text-blue-600' },
    detailPath: '/sales/invoices',
    emptyPlacement: 'page',
  },
  payable: {
    useReport: useAPAgingReport,
    ns: 'apAging',
    totalKey: 'totalPayable',
    partyKey: 'vendor',
    icon: Building2,
    iconClassName: { box: 'bg-orange-100', icon: 'text-orange-600' },
    detailPath: '/purchases/bills',
    emptyPlacement: 'buckets',
  },
};

/** Message key of each bucket range the API sends (an unknown range shows as sent). */
const BUCKET_LABEL_KEYS: Record<string, string> = {
  current: 'current',
  '1-30': 'days1to30',
  '31-60': 'days31to60',
  '61-90': 'days61to90',
  '90+': 'over90',
};

/**
 * The AR or AP aging report page: totals, clickable buckets and the documents of the open bucket.
 * Figures are ledger amounts in the organization base currency (audit B5).
 */
export function AgingReportPage({ side }: { side: 'receivable' | 'payable' }): JSX.Element {
  const config = AGING_SIDES[side];
  // Fixed per page, so the same hook runs on every render.
  const useReport = config.useReport;
  const formatCurrency = useMoneyFormatter();
  const t = useTranslations('reports');
  const shortDate = useDateFormatter();
  const longDate = useDateFormatter('long');
  /** A message of this side's namespace (arAging or apAging). */
  const ts = (key: string, values?: Record<string, string | number>) =>
    t(`${config.ns}.${key}`, values);
  const bucketLabel = (range: string) =>
    BUCKET_LABEL_KEYS[range] ? ts(BUCKET_LABEL_KEYS[range]) : range;
  const [asOfDate, setAsOfDate] = useState(new Date());
  const [expandedBucket, setExpandedBucket] = useState<string | null>(null);
  const { data: report, isLoading, isError, refetch } = useReport(format(asOfDate, 'yyyy-MM-dd'));

  if (isLoading) return <ReportPageSkeleton />;
  if (isError) return <ReportLoadError onRetry={() => void refetch()} />;

  const buckets = Array.isArray(report?.buckets) ? report.buckets : [];
  const expanded = buckets.find((b: AgingBucket) => b.range === expandedBucket);
  const Icon = config.icon;

  const summary = (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-3">
            <div className={cn('p-2 rounded-lg', config.iconClassName.box)}>
              <Icon className={cn('h-5 w-5', config.iconClassName.icon)} />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{ts(config.totalKey)}</p>
              <p className="text-2xl font-bold font-mono">{formatCurrency(report?.total ?? 0)}</p>
              {report && report.unappliedCredits > 0 && (
                <p className="text-xs text-muted-foreground">
                  {t('agingUnappliedCredits', {
                    amount: formatCurrency(report.unappliedCredits),
                  })}
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">{ts('outstanding')}</p>
          <p className="text-2xl font-bold">{report?.totalCount ?? 0}</p>
        </CardContent>
      </Card>
    </div>
  );

  const bucketsCard = (
    <Card>
      <CardHeader>
        <CardTitle>{t('aging.summary')}</CardTitle>
      </CardHeader>
      <CardContent>
        {buckets.length === 0 ? (
          <p className="text-center py-8 text-muted-foreground">{ts('empty')}</p>
        ) : (
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
                <p className="text-sm font-medium">{bucketLabel(bucket.range)}</p>
                <p className="text-xl font-bold font-mono mt-1">{formatCurrency(bucket.amount)}</p>
                <p className="text-xs mt-1">{ts('bucketCount', { count: bucket.count })}</p>
              </button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );

  const detailCard = expandedBucket && (
    <Card>
      <CardHeader>
        <CardTitle>{ts('bucketTitle', { bucket: bucketLabel(expandedBucket) })}</CardTitle>
      </CardHeader>
      <CardContent>
        {expanded?.items?.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{ts('number')}</TableHead>
                <TableHead>{ts(config.partyKey)}</TableHead>
                <TableHead>{ts('documentDate')}</TableHead>
                <TableHead>{t('aging.dueDate')}</TableHead>
                <TableHead className="text-right">{t('aging.amount')}</TableHead>
                <TableHead className="text-right">{t('aging.balanceDue')}</TableHead>
                <TableHead className="text-center">{t('aging.daysOverdue')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {expanded.items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <Link
                      href={`${config.detailPath}/${item.id}`}
                      className="font-medium hover:text-blue-600 hover:underline"
                    >
                      {item.number}
                    </Link>
                  </TableCell>
                  <TableCell>{item.counterpartyName}</TableCell>
                  <TableCell>{shortDate(item.date)}</TableCell>
                  <TableCell>{shortDate(item.dueDate)}</TableCell>
                  <TableCell className="text-right font-mono">
                    {formatCurrency(item.amount)}
                  </TableCell>
                  <TableCell className="text-right font-mono font-medium">
                    {formatCurrency(item.balanceDue)}
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
              ))}
            </TableBody>
          </Table>
        ) : (
          <p className="text-center py-8 text-muted-foreground">{ts('bucketEmpty')}</p>
        )}
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      <ReportPageHeader
        title={ts('title')}
        subtitle={t('aging.asOf', { date: longDate(asOfDate) })}
      />

      <ReportFilters
        asOfDate={asOfDate}
        onAsOfDateChange={setAsOfDate}
        showDateRange={false}
        showAsOfDate
      />

      {buckets.length === 0 && config.emptyPlacement === 'page' ? (
        <Card>
          <CardContent className="pt-6 text-center text-muted-foreground">
            {ts('empty')}
          </CardContent>
        </Card>
      ) : (
        <>
          {summary}
          {bucketsCard}
          {detailCard}
        </>
      )}
    </div>
  );
}
