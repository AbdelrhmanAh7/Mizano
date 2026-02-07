'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import Link from 'next/link';
import { ArrowLeft, Building2 } from 'lucide-react';
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
import {
  useAPAgingReport,
  formatCurrency,
  getAgingBucketLabel,
  getAgingBucketColor,
  AgingBucket,
} from '@/lib/hooks/use-reports';

export default function APAgingReportPage() {
  const [asOfDate, setAsOfDate] = useState(new Date());
  const [expandedBucket, setExpandedBucket] = useState<string | null>(null);

  const { data: report, isLoading } = useAPAgingReport(format(asOfDate, 'yyyy-MM-dd'));

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-12 w-full max-w-md" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  const reportData = report || { buckets: [], total: 0, totalCount: 0 };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/reports">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Accounts Payable Aging</h1>
          <p className="text-muted-foreground">
            As of {format(asOfDate, 'MMMM d, yyyy')}
          </p>
        </div>
      </div>

      <ReportFilters
        asOfDate={asOfDate}
        onAsOfDateChange={setAsOfDate}
        showDateRange={false}
        showAsOfDate
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-orange-100 rounded-lg">
                <Building2 className="h-5 w-5 text-orange-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Payable</p>
                <p className="text-2xl font-bold font-mono">
                  {formatCurrency(reportData.total)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Outstanding Bills</p>
            <p className="text-2xl font-bold">{reportData.totalCount}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Aging Summary</CardTitle>
        </CardHeader>
        <CardContent>
          {reportData.buckets.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground">
              No outstanding payables found.
            </p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              {reportData.buckets.map((bucket: AgingBucket) => (
                <button
                  key={bucket.range}
                  onClick={() =>
                    setExpandedBucket(
                      expandedBucket === bucket.range ? null : bucket.range
                    )
                  }
                  className={cn(
                    'p-4 rounded-lg border-2 text-left transition-colors',
                    expandedBucket === bucket.range
                      ? 'border-primary'
                      : 'border-transparent hover:border-primary/50',
                    getAgingBucketColor(bucket.range)
                  )}
                >
                  <p className="text-sm font-medium">{getAgingBucketLabel(bucket.range)}</p>
                  <p className="text-xl font-bold font-mono mt-1">
                    {formatCurrency(bucket.amount)}
                  </p>
                  <p className="text-xs mt-1">{bucket.count} bills</p>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {expandedBucket && (
        <Card>
          <CardHeader>
            <CardTitle>{getAgingBucketLabel(expandedBucket)} Bills</CardTitle>
          </CardHeader>
          <CardContent>
            {reportData.buckets.find((b: AgingBucket) => b.range === expandedBucket)?.items?.length ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Bill #</TableHead>
                    <TableHead>Vendor</TableHead>
                    <TableHead>Bill Date</TableHead>
                    <TableHead>Due Date</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-right">Balance Due</TableHead>
                    <TableHead className="text-center">Days Overdue</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reportData.buckets
                    .find((b: AgingBucket) => b.range === expandedBucket)
                    ?.items?.map((item: any) => (
                      <TableRow key={item.id}>
                        <TableCell>
                          <Link
                            href={`/purchases/bills/${item.id}`}
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
                                : 'bg-green-100 text-green-800'
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
                No bills in this aging bucket
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
