'use client';

import { DataTable } from '@/components/data-table/data-table';
import { ReportFilters } from '@/components/reports/report-filters';
import { ReportLoadError } from '@/components/reports/report-load-error';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  formatCurrency,
  useSalesByItemReport,
  type SalesByItemEntry,
} from '@/lib/hooks/use-reports';
import type { ColumnDef } from '@tanstack/react-table';
import { endOfMonth, format, startOfYear } from 'date-fns';
import { DollarSign, Hash, Package } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Suspense, useMemo, useState } from 'react';

function SalesByItemContent() {
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

  const { data, isLoading, isError, refetch } = useSalesByItemReport(params);
  // Report amounts are labelled with the currency the API returns, never a default.
  const currencyCode = data?.currencyCode;

  const columns: ColumnDef<SalesByItemEntry>[] = useMemo(
    () => [
      {
        accessorKey: 'itemName',
        header: t('item'),
        cell: ({ row }) => (
          <div>
            <div className="font-medium">{row.original.itemName}</div>
            {row.original.sku && (
              <div className="text-xs text-muted-foreground">{row.original.sku}</div>
            )}
          </div>
        ),
      },
      {
        accessorKey: 'quantitySold',
        header: t('quantitySold'),
        cell: ({ row }) => row.original.quantitySold.toLocaleString(),
        meta: { headerClassName: 'text-right', cellClassName: 'text-right' },
      },
      {
        accessorKey: 'averagePrice',
        header: t('averagePrice'),
        cell: ({ row }) => formatCurrency(row.original.averagePrice, currencyCode),
        meta: { headerClassName: 'text-right', cellClassName: 'text-right' },
      },
      {
        accessorKey: 'totalAmount',
        header: t('totalAmount'),
        cell: ({ row }) => (
          <span className="font-medium">
            {formatCurrency(row.original.totalAmount, currencyCode)}
          </span>
        ),
        meta: { headerClassName: 'text-right', cellClassName: 'text-right' },
      },
    ],
    [currencyCode, t],
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t('salesByItem.title')}</h1>
        <p className="text-muted-foreground">{t('salesByItem.description')}</p>
      </div>

      <ReportFilters dateRange={dateRange} onDateRangeChange={setDateRange} showDateRange />

      {/* Summary Cards */}
      {data && !isError && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">{t('salesByItem.totalRevenue')}</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {formatCurrency(data.totalAmount, currencyCode)}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">
                {t('salesByItem.totalQuantitySold')}
              </CardTitle>
              <Hash className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{data.totalQuantity?.toLocaleString() || 0}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">{t('salesByItem.uniqueItems')}</CardTitle>
              <Package className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{data.entries?.length || 0}</div>
            </CardContent>
          </Card>
        </div>
      )}

      {isError ? (
        <ReportLoadError onRetry={() => void refetch()} />
      ) : (
        <Card>
          <CardContent className="pt-6">
            <DataTable
              columns={columns}
              data={data?.entries || []}
              isLoading={isLoading}
              emptyMessage={t('salesByItem.empty')}
              enableExport
              exportFilename="sales-by-item"
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function SalesByItemPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <SalesByItemContent />
    </Suspense>
  );
}
