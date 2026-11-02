'use client';

import { DataTable } from '@/components/data-table/data-table';
import { ReportFilters } from '@/components/reports/report-filters';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { usePurchasesByVendorReport, type PurchasesByVendorEntry } from '@/lib/hooks/use-reports';
import { useMoneyFormatter } from '@/lib/hooks/use-money-formatter';
import type { ColumnDef } from '@tanstack/react-table';
import { endOfMonth, format, startOfYear } from 'date-fns';
import { Building2, DollarSign, Receipt, Wallet } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Suspense, useMemo, useState } from 'react';

function PurchasesByVendorContent() {
  // Report figures are ledger amounts, in the organization base currency (audit B5).
  const formatCurrency = useMoneyFormatter();
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
        header: t('purchasesByVendor.columns.vendor'),
        cell: ({ row }) => <div className="font-medium">{row.original.vendorName}</div>,
      },
      {
        accessorKey: 'billCount',
        header: t('purchasesByVendor.columns.bills'),
        cell: ({ row }) => row.original.billCount,
        meta: { headerClassName: 'text-right', cellClassName: 'text-right' },
      },
      {
        accessorKey: 'totalAmount',
        header: t('purchasesByVendor.columns.totalAmount'),
        cell: ({ row }) => formatCurrency(row.original.totalAmount),
        meta: { headerClassName: 'text-right', cellClassName: 'text-right' },
      },
      {
        accessorKey: 'paidAmount',
        header: t('purchasesByVendor.columns.paid'),
        cell: ({ row }) => formatCurrency(row.original.paidAmount),
        meta: { headerClassName: 'text-right', cellClassName: 'text-right' },
      },
      {
        accessorKey: 'balanceDue',
        header: t('purchasesByVendor.columns.balanceDue'),
        cell: ({ row }) => (
          <span className={row.original.balanceDue > 0 ? 'text-destructive font-medium' : ''}>
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
    [t, formatCurrency],
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
              <CardTitle className="text-sm font-medium">
                {t('purchasesByVendor.totalPurchases')}
              </CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(data.totalAmount)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">
                {t('purchasesByVendor.totalPaid')}
              </CardTitle>
              <Wallet className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-success">
                {formatCurrency(data.totalPaid)}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">
                {t('purchasesByVendor.outstanding')}
              </CardTitle>
              <Receipt className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-destructive">
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
              <div className="text-2xl font-bold text-destructive">
                {formatCurrency(data.totalNetPayable)}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">
                {t('purchasesByVendor.vendors')}
              </CardTitle>
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
            emptyMessage={t('purchasesByVendor.noData')}
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
