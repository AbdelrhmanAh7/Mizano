'use client';

import { DataTable } from '@/components/data-table/data-table';
import { ReportFilters } from '@/components/reports/report-filters';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  formatCurrency,
  usePurchasesByVendorReport,
  type PurchasesByVendorEntry,
} from '@/lib/hooks/use-reports';
import type { ColumnDef } from '@tanstack/react-table';
import { endOfMonth, format, startOfYear } from 'date-fns';
import { Building2, DollarSign, Receipt, Wallet } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Suspense, useMemo, useState } from 'react';

function PurchasesByVendorContent() {
  const t = useTranslations('reports');
  const today = new Date();
  const [dateRange, setDateRange] = useState({
    startDate: startOfYear(today),
    endDate: endOfMonth(today),
  });

  const params = useMemo(
    () => ({
      startDate: format(dateRange.startDate, 'yyyy-MM-dd'),
      endDate: format(dateRange.endDate, 'yyyy-MM-dd'),
    }),
    [dateRange],
  );

  const { data, isLoading } = usePurchasesByVendorReport(params);

  const columns: ColumnDef<PurchasesByVendorEntry>[] = useMemo(
    () => [
      {
        accessorKey: 'vendorName',
        header: 'Vendor',
        cell: ({ row }) => <div className="font-medium">{row.original.vendorName}</div>,
      },
      {
        accessorKey: 'billCount',
        header: 'Bills',
        cell: ({ row }) => row.original.billCount,
        meta: { headerClassName: 'text-right', cellClassName: 'text-right' },
      },
      {
        accessorKey: 'totalAmount',
        header: 'Total Amount',
        cell: ({ row }) => formatCurrency(row.original.totalAmount),
        meta: { headerClassName: 'text-right', cellClassName: 'text-right' },
      },
      {
        accessorKey: 'paidAmount',
        header: 'Paid',
        cell: ({ row }) => formatCurrency(row.original.paidAmount),
        meta: { headerClassName: 'text-right', cellClassName: 'text-right' },
      },
      {
        accessorKey: 'balanceDue',
        header: 'Balance Due',
        cell: ({ row }) => (
          <span className={row.original.balanceDue > 0 ? 'text-red-600 font-medium' : ''}>
            {formatCurrency(row.original.balanceDue)}
          </span>
        ),
        meta: { headerClassName: 'text-right', cellClassName: 'text-right' },
      },
      {
        accessorKey: 'unappliedCredits',
        header: t('purchasesByVendor.unappliedCredits'),
        cell: ({ row }) => formatCurrency(row.original.unappliedCredits),
        meta: { headerClassName: 'text-right', cellClassName: 'text-right' },
      },
      {
        accessorKey: 'netPayable',
        header: t('purchasesByVendor.netPayable'),
        cell: ({ row }) => (
          <span className="font-medium">{formatCurrency(row.original.netPayable)}</span>
        ),
        meta: { headerClassName: 'text-right', cellClassName: 'text-right' },
      },
    ],
    [t],
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t('purchasesByVendor.title')}</h1>
        <p className="text-muted-foreground">{t('purchasesByVendor.description')}</p>
      </div>

      <ReportFilters dateRange={dateRange} onDateRangeChange={setDateRange} showDateRange />

      {/* Summary Cards */}
      {data && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total Purchases</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(data.totalAmount)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total Paid</CardTitle>
              <Wallet className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                {formatCurrency(data.totalPaid)}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Outstanding</CardTitle>
              <Receipt className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">
                {formatCurrency(data.totalBalance)}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">
                {t('purchasesByVendor.totalUnappliedCredits')}
              </CardTitle>
              <Wallet className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(data.totalUnappliedCredits)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">
                {t('purchasesByVendor.totalNetPayable')}
              </CardTitle>
              <Receipt className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">
                {formatCurrency(data.totalNetPayable)}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Vendors</CardTitle>
              <Building2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{data.entries?.length || 0}</div>
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardContent className="pt-6">
          <DataTable
            columns={columns}
            data={data?.entries || []}
            isLoading={isLoading}
            emptyMessage="No purchase data found for the selected period."
            enableExport
            exportFilename="purchases-by-vendor"
          />
        </CardContent>
      </Card>
    </div>
  );
}

export default function PurchasesByVendorPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <PurchasesByVendorContent />
    </Suspense>
  );
}
