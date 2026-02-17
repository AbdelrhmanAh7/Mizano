'use client';

import { DataTable, DataTableSearch, SortableHeader } from '@/components/data-table';
import { PaymentModeBadge } from '@/components/sales/status-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  PaymentMode,
  PaymentReceived,
  getPaymentModeOptions,
  useInfinitePaymentsReceived,
} from '@/lib/hooks/use-payments-received';
import { usePermissions } from '@/lib/hooks/use-permissions';
import { useTableParams } from '@/lib/hooks/use-table-params';
import { type ColumnDef } from '@tanstack/react-table';
import { format } from 'date-fns';
import { Eye, Filter, Plus, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { Suspense, useState } from 'react';

function PaymentsReceivedPageContent() {
  const { hasPermission } = usePermissions();
  const tableParams = useTableParams({ defaultSortBy: 'date', mode: 'virtual' });

  const [selectedMode, setSelectedMode] = useState<string>('all');

  const {
    data: payments,
    total,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
    isLoading,
    refetch,
  } = useInfinitePaymentsReceived({
    ...tableParams.queryParams,
    paymentMode: selectedMode !== 'all' ? (selectedMode as PaymentMode) : undefined,
  });

  const canCreate = hasPermission('sales.create');

  const formatCurrency = (amount: string | number, currency: string = 'USD') => {
    const num = typeof amount === 'string' ? parseFloat(amount) : amount;
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
    }).format(num);
  };

  const paymentModeOptions = getPaymentModeOptions();

  const columns: ColumnDef<PaymentReceived>[] = [
    {
      accessorKey: 'paymentNumber',
      header: () => (
        <SortableHeader
          label="Payment #"
          columnId="paymentNumber"
          currentSortBy={tableParams.sortBy}
          currentSortOrder={tableParams.sortOrder}
          onSort={tableParams.setSort}
        />
      ),
      cell: ({ row }) => (
        <Link href={`/sales/payments/${row.original.id}`} className="font-medium hover:underline">
          {row.original.paymentNumber}
        </Link>
      ),
    },
    {
      accessorKey: 'customer.name',
      header: 'Customer',
      cell: ({ row }) => {
        const payment = row.original;
        return payment.customer ? (
          <Link href={`/sales/customers/${payment.customer.id}`} className="hover:underline">
            {payment.customer.name}
          </Link>
        ) : (
          '-'
        );
      },
    },
    {
      accessorKey: 'date',
      header: () => (
        <SortableHeader
          label="Date"
          columnId="date"
          currentSortBy={tableParams.sortBy}
          currentSortOrder={tableParams.sortOrder}
          onSort={tableParams.setSort}
        />
      ),
      cell: ({ row }) => format(new Date(row.original.date), 'MMM d, yyyy'),
    },
    {
      accessorKey: 'paymentMode',
      header: 'Mode',
      cell: ({ row }) => <PaymentModeBadge mode={row.original.paymentMode} />,
    },
    {
      accessorKey: 'reference',
      header: 'Reference',
      cell: ({ row }) => row.original.reference || '-',
    },
    {
      accessorKey: 'amount',
      header: () => (
        <SortableHeader
          label="Amount"
          columnId="amount"
          currentSortBy={tableParams.sortBy}
          currentSortOrder={tableParams.sortOrder}
          onSort={tableParams.setSort}
        />
      ),
      meta: {
        headerClassName: 'text-right',
        cellClassName: 'text-right font-mono text-green-600 font-semibold',
      },
      cell: ({ row }) => formatCurrency(row.original.amount),
    },
    {
      id: 'actions',
      header: '',
      meta: { cellClassName: 'text-right' },
      cell: ({ row }) => (
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/sales/payments/${row.original.id}`}>
            <Eye className="h-4 w-4" />
          </Link>
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Payments Received</h1>
          <p className="text-muted-foreground">Track and manage customer payments</p>
        </div>
        <div className="flex items-center gap-2">
          {canCreate && (
            <Button asChild>
              <Link href="/sales/payments/new">
                <Plus className="mr-2 h-4 w-4" />
                Record Payment
              </Link>
            </Button>
          )}
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <DataTableSearch
              value={tableParams.search}
              onChange={tableParams.setSearch}
              placeholder="Search by payment number or customer..."
            />
            <Select value={selectedMode} onValueChange={setSelectedMode}>
              <SelectTrigger className="w-[180px]">
                <Filter className="mr-2 h-4 w-4" />
                <SelectValue placeholder="Filter by mode" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Modes</SelectItem>
                {paymentModeOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="icon"
              onClick={() => refetch()}
              aria-label="Refresh payments"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Payments Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Payments</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            data={payments}
            total={total}
            isLoading={isLoading}
            enableVirtualization
            hasNextPage={hasNextPage}
            isFetchingNextPage={isFetchingNextPage}
            onLoadMore={() => fetchNextPage()}
            enableColumnResizing
            tableId="payments-received"
            emptyMessage="No payments found"
            emptyAction={
              canCreate ? (
                <Button asChild>
                  <Link href="/sales/payments/new">
                    <Plus className="mr-2 h-4 w-4" />
                    Record Your First Payment
                  </Link>
                </Button>
              ) : undefined
            }
          />
        </CardContent>
      </Card>
    </div>
  );
}

export default function PaymentsReceivedPage() {
  return (
    <Suspense>
      <PaymentsReceivedPageContent />
    </Suspense>
  );
}
