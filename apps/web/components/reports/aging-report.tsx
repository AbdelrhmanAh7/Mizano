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
  getAgingBucketLabel,
  useAPAgingReport,
  useARAgingReport,
} from '@/lib/hooks/use-reports';
import { useMoneyFormatter } from '@/lib/hooks/use-money-formatter';

type Translate = (key: string) => string;

/** What differs between the receivable (customers, invoices) and payable (vendors, bills) report. */
interface AgingSide {
  useReport: (asOfDate: string) => UseQueryResult<AgingReport>;
  title: (t: Translate) => string;
  totalLabel: (t: Translate) => string;
  icon: LucideIcon;
  iconClassName: { box: string; icon: string };
  countLabel: string;
  documents: string;
  numberHeader: string;
  partyHeader: string;
  dateHeader: string;
  detailPath: string;
  /** Receivables hide the summary when empty; payables keep it and say so in the buckets card. */
  empty: { placement: 'page' | 'buckets'; message: string };
}

const AGING_SIDES: Record<'receivable' | 'payable', AgingSide> = {
  receivable: {
    useReport: useARAgingReport,
    title: (t) => t('arAging.title'),
    totalLabel: (t) => t('arAging.total'),
    icon: Users,
    iconClassName: { box: 'bg-blue-100', icon: 'text-blue-600' },
    countLabel: 'Outstanding Invoices',
    documents: 'invoices',
    numberHeader: 'Invoice #',
    partyHeader: 'Customer',
    dateHeader: 'Invoice Date',
    detailPath: '/sales/invoices',
    empty: { placement: 'page', message: 'No accounts receivable aging data available.' },
  },
  payable: {
    useReport: useAPAgingReport,
    title: (t) => t('apAging.title'),
    totalLabel: () => 'Total Payable',
    icon: Building2,
    iconClassName: { box: 'bg-orange-100', icon: 'text-orange-600' },
    countLabel: 'Outstanding Bills',
    documents: 'bills',
    numberHeader: 'Bill #',
    partyHeader: 'Vendor',
    dateHeader: 'Bill Date',
    detailPath: '/purchases/bills',
    empty: { placement: 'buckets', message: 'No outstanding payables found.' },
  },
};

const capitalize = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);

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
              <p className="text-sm text-muted-foreground">{config.totalLabel(t)}</p>
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
          <p className="text-sm text-muted-foreground">{config.countLabel}</p>
          <p className="text-2xl font-bold">{report?.totalCount ?? 0}</p>
        </CardContent>
      </Card>
    </div>
  );

  const bucketsCard = (
    <Card>
      <CardHeader>
        <CardTitle>Aging Summary</CardTitle>
      </CardHeader>
      <CardContent>
        {buckets.length === 0 ? (
          <p className="text-center py-8 text-muted-foreground">{config.empty.message}</p>
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
                <p className="text-sm font-medium">{getAgingBucketLabel(bucket.range)}</p>
                <p className="text-xl font-bold font-mono mt-1">{formatCurrency(bucket.amount)}</p>
                <p className="text-xs mt-1">
                  {bucket.count} {config.documents}
                </p>
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
        <CardTitle>
          {getAgingBucketLabel(expandedBucket)} {capitalize(config.documents)}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {expanded?.items?.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{config.numberHeader}</TableHead>
                <TableHead>{config.partyHeader}</TableHead>
                <TableHead>{config.dateHeader}</TableHead>
                <TableHead>Due Date</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right">Balance Due</TableHead>
                <TableHead className="text-center">Days Overdue</TableHead>
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
                  <TableCell>{format(new Date(item.date), 'MMM d, yyyy')}</TableCell>
                  <TableCell>{format(new Date(item.dueDate), 'MMM d, yyyy')}</TableCell>
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
          <p className="text-center py-8 text-muted-foreground">
            No {config.documents} in this aging bucket
          </p>
        )}
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      <ReportPageHeader
        title={config.title(t)}
        subtitle={`As of ${format(asOfDate, 'MMMM d, yyyy')}`}
      />

      <ReportFilters
        asOfDate={asOfDate}
        onAsOfDateChange={setAsOfDate}
        showDateRange={false}
        showAsOfDate
      />

      {buckets.length === 0 && config.empty.placement === 'page' ? (
        <Card>
          <CardContent className="pt-6 text-center text-muted-foreground">
            {config.empty.message}
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
