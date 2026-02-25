'use client';

import { DataTable } from '@/components/data-table/data-table';
import { ReportFilters } from '@/components/reports/report-filters';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  formatCurrency,
  useSalesByItemReport,
  type SalesByItemEntry,
} from '@/lib/hooks/use-reports';
import type { ColumnDef } from '@tanstack/react-table';
import { endOfMonth, format, startOfMonth } from 'date-fns';
import { DollarSign, Hash, Package } from 'lucide-react';
import { Suspense, useMemo, useState } from 'react';

function SalesByItemContent() {
  const today = new Date();
  const [dateRange, setDateRange] = useState({
    startDate: startOfMonth(today),
    endDate: endOfMonth(today),
  });

  const params = useMemo(
    () => ({
      startDate: format(dateRange.startDate, 'yyyy-MM-dd'),
      endDate: format(dateRange.endDate, 'yyyy-MM-dd'),
    }),
    [dateRange],
  );

  const { data, isLoading } = useSalesByItemReport(params);

  const columns: ColumnDef<SalesByItemEntry>[] = useMemo(
    () => [
      {
        accessorKey: 'itemName',
        header: 'Item',
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
        header: 'Qty Sold',
        cell: ({ row }) => row.original.quantitySold.toLocaleString(),
        meta: { headerClassName: 'text-right', cellClassName: 'text-right' },
      },
      {
        accessorKey: 'averagePrice',
        header: 'Avg. Price',
        cell: ({ row }) => formatCurrency(row.original.averagePrice),
        meta: { headerClassName: 'text-right', cellClassName: 'text-right' },
      },
      {
        accessorKey: 'totalAmount',
        header: 'Total Amount',
        cell: ({ row }) => (
          <span className="font-medium">{formatCurrency(row.original.totalAmount)}</span>
        ),
        meta: { headerClassName: 'text-right', cellClassName: 'text-right' },
      },
    ],
    [],
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Sales by Item</h1>
        <p className="text-muted-foreground">
          Breakdown of sales revenue by product/item for the selected period
        </p>
      </div>

      <ReportFilters dateRange={dateRange} onDateRangeChange={setDateRange} showDateRange />

      {/* Summary Cards */}
      {data && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(data.totalAmount)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total Qty Sold</CardTitle>
              <Hash className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{data.totalQuantity?.toLocaleString() || 0}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Unique Items</CardTitle>
              <Package className="h-4 w-4 text-muted-foreground" />
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
            emptyMessage="No item sales data found for the selected period."
            enableExport
            exportFilename="sales-by-item"
          />
        </CardContent>
      </Card>
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
