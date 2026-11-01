'use client';

import { DataTable } from '@/components/data-table/data-table';
import { ReportFilters } from '@/components/reports/report-filters';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useSalesByCustomerReport, type SalesByCustomerEntry } from '@/lib/hooks/use-reports';
import { useMoneyFormatter } from '@/lib/hooks/use-money-formatter';
import type { ColumnDef } from '@tanstack/react-table';
import { endOfMonth, format, startOfYear } from 'date-fns';
import { DollarSign, Receipt, Users, Wallet } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Suspense, useMemo, useState } from 'react';

function SalesByCustomerContent() {
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

  const { data, isLoading } = useSalesByCustomerReport(params);

  const columns: ColumnDef<SalesByCustomerEntry>[] = useMemo(
    () => [
      {
        accessorKey: 'customerName',
        header: t('salesByCustomer.columns.customer'),
        cell: ({ row }) => <div className="font-medium">{row.original.customerName}</div>,
      },
      {
        accessorKey: 'invoiceCount',
        header: t('salesByCustomer.columns.invoices'),
        cell: ({ row }) => row.original.invoiceCount,
        meta: { headerClassName: 'text-right', cellClassName: 'text-right' },
      },
      {
        accessorKey: 'totalAmount',
        header: t('salesByCustomer.columns.totalAmount'),
        cell: ({ row }) => formatCurrency(row.original.totalAmount),
        meta: { headerClassName: 'text-right', cellClassName: 'text-right' },
      },
      {
        accessorKey: 'paidAmount',
        header: t('salesByCustomer.columns.paid'),
        cell: ({ row }) => formatCurrency(row.original.paidAmount),
        meta: { headerClassName: 'text-right', cellClassName: 'text-right' },
      },
      {
        accessorKey: 'balanceDue',
        header: t('salesByCustomer.columns.balanceDue'),
        cell: ({ row }) => (
          <span className={row.original.balanceDue > 0 ? 'text-red-600 font-medium' : ''}>
            {formatCurrency(row.original.balanceDue)}
          </span>
        ),
        meta: { headerClassName: 'text-right', cellClassName: 'text-right' },
      },
    ],
    [t, formatCurrency],
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
              <CardTitle className="text-sm font-medium">
                {t('salesByCustomer.totalSales')}
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
                {t('salesByCustomer.totalPaid')}
              </CardTitle>
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
              <CardTitle className="text-sm font-medium">
                {t('salesByCustomer.outstanding')}
              </CardTitle>
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
                {t('salesByCustomer.customers')}
              </CardTitle>
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
            emptyMessage={t('salesByCustomer.noData')}
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
