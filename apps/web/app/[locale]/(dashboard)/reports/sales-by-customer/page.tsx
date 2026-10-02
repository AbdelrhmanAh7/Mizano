'use client';

import { DataTable } from '@/components/data-table/data-table';
import { ReportFilters } from '@/components/reports/report-filters';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  formatCurrency,
  useSalesByCustomerReport,
  type SalesByCustomerEntry,
} from '@/lib/hooks/use-reports';
import type { ColumnDef } from '@tanstack/react-table';
import { endOfMonth, format, startOfYear } from 'date-fns';
import { DollarSign, Receipt, Users, Wallet } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Suspense, useMemo, useState } from 'react';

function SalesByCustomerContent() {
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

  const { data, isLoading } = useSalesByCustomerReport(params);
  // Report amounts are labelled with the currency the API returns, never a default.
  const currencyCode = data?.currencyCode;

  const columns: ColumnDef<SalesByCustomerEntry>[] = useMemo(
    () => [
      {
        accessorKey: 'customerName',
        header: 'Customer',
        cell: ({ row }) => <div className="font-medium">{row.original.customerName}</div>,
      },
      {
        accessorKey: 'invoiceCount',
        header: 'Invoices',
        cell: ({ row }) => row.original.invoiceCount,
        meta: { headerClassName: 'text-right', cellClassName: 'text-right' },
      },
      {
        accessorKey: 'totalAmount',
        header: 'Total Amount',
        cell: ({ row }) => formatCurrency(row.original.totalAmount, currencyCode),
        meta: { headerClassName: 'text-right', cellClassName: 'text-right' },
      },
      {
        accessorKey: 'paidAmount',
        header: 'Paid',
        cell: ({ row }) => formatCurrency(row.original.paidAmount, currencyCode),
        meta: { headerClassName: 'text-right', cellClassName: 'text-right' },
      },
      {
        accessorKey: 'balanceDue',
        header: 'Balance Due',
        cell: ({ row }) => (
          <span className={row.original.balanceDue > 0 ? 'text-red-600 font-medium' : ''}>
            {formatCurrency(row.original.balanceDue, currencyCode)}
          </span>
        ),
        meta: { headerClassName: 'text-right', cellClassName: 'text-right' },
      },
    ],
    [currencyCode],
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t('salesByCustomer.title')}</h1>
        <p className="text-muted-foreground">{t('salesByCustomer.description')}</p>
      </div>

      <ReportFilters dateRange={dateRange} onDateRangeChange={setDateRange} showDateRange />

      {/* Summary Cards */}
      {data && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total Sales</CardTitle>
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
              <CardTitle className="text-sm font-medium">Total Paid</CardTitle>
              <Wallet className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                {formatCurrency(data.totalPaid, currencyCode)}
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
                {formatCurrency(data.totalBalance, currencyCode)}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Customers</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
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
            emptyMessage="No sales data found for the selected period."
            enableExport
            exportFilename="sales-by-customer"
          />
        </CardContent>
      </Card>
    </div>
  );
}

export default function SalesByCustomerPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <SalesByCustomerContent />
    </Suspense>
  );
}
