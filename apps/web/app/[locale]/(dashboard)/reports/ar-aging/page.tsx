'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import Link from 'next/link';
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
import {
  useARAgingReport,
  formatCurrency,
  getAgingBucketLabel,
  getAgingBucketColor,
  AgingBucket,
} from '@/lib/hooks/use-reports';

export default function ARAgingReportPage() {
  const [asOfDate, setAsOfDate] = useState(new Date());
  const [expandedBucket, setExpandedBucket] = useState<string | null>(null);

  const { data: report, isLoading } = useARAgingReport(format(asOfDate, 'yyyy-MM-dd'));

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-12 w-full max-w-md" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  // Mock data for display
  const mockReport = report || {
    buckets: [
      {
        range: 'current',
        amount: 15000,
        count: 5,
        items: [
          { id: '1', number: 'INV-001', date: '2024-01-15', dueDate: '2024-02-15', counterpartyName: 'Acme Corp', amount: 5000, balanceDue: 5000, daysOverdue: 0 },
          { id: '2', number: 'INV-002', date: '2024-01-20', dueDate: '2024-02-20', counterpartyName: 'Tech Solutions', amount: 3000, balanceDue: 3000, daysOverdue: 0 },
        ],
      },
      {
        range: '1-15',
        amount: 8000,
        count: 3,
        items: [
          { id: '3', number: 'INV-003', date: '2024-01-01', dueDate: '2024-01-31', counterpartyName: 'Global Inc', amount: 8000, balanceDue: 8000, daysOverdue: 10 },
        ],
      },
      {
        range: '16-30',
        amount: 5000,
        count: 2,
        items: [],
      },
      {
        range: '31-60',
        amount: 3000,
        count: 1,
        items: [],
      },
      {
        range: '61-90',
        amount: 2000,
        count: 1,
        items: [],
      },
      {
        range: '90+',
        amount: 1500,
        count: 1,
        items: [],
      },
    ],
    total: 34500,
    totalCount: 13,
  };

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
          <h1 className="text-3xl font-bold tracking-tight">Accounts Receivable Aging</h1>
          <p className="text-muted-foreground">
            As of {format(asOfDate, 'MMMM d, yyyy')}
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

      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Users className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Outstanding</p>
                <p className="text-2xl font-bold font-mono">
                  {formatCurrency(mockReport.total)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Outstanding Invoices</p>
            <p className="text-2xl font-bold">{mockReport.totalCount}</p>
          </CardContent>
        </Card>
      </div>

      {/* Aging Buckets */}
      <Card>
        <CardHeader>
          <CardTitle>Aging Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {mockReport.buckets.map((bucket) => (
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
                <p className="text-xs mt-1">{bucket.count} invoices</p>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Detail Table */}
      {expandedBucket && (
        <Card>
          <CardHeader>
            <CardTitle>{getAgingBucketLabel(expandedBucket)} Invoices</CardTitle>
          </CardHeader>
          <CardContent>
            {mockReport.buckets.find((b) => b.range === expandedBucket)?.items?.length ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice #</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Invoice Date</TableHead>
                    <TableHead>Due Date</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-right">Balance Due</TableHead>
                    <TableHead className="text-center">Days Overdue</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {mockReport.buckets
                    .find((b) => b.range === expandedBucket)
                    ?.items?.map((item) => (
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
                          {format(new Date(item.date), 'MMM d, yyyy')}
                        </TableCell>
                        <TableCell>
                          {format(new Date(item.dueDate), 'MMM d, yyyy')}
                        </TableCell>
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
                No invoices in this aging bucket
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
