'use client';

import { DataTable, DataTableSearch, SortableHeader } from '@/components/data-table';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    formatCurrency,
    formatPaymentMode,
    PaymentMade,
    useDeletePaymentMade,
    useInfinitePaymentsMade,
} from '@/lib/hooks/use-payments-made';
import { useTableParams } from '@/lib/hooks/use-table-params';
import { type ColumnDef } from '@tanstack/react-table';
import { format } from 'date-fns';
import { Eye, Plus, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { Suspense, useState } from 'react';

function PaymentsMadePageContent() {
  const tableParams = useTableParams({ defaultSortBy: 'date', mode: 'virtual' });

  const [deleteId, setDeleteId] = useState<string | null>(null);

  const {
    data: payments,
    total,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
    isLoading,
  } = useInfinitePaymentsMade({
    ...tableParams.queryParams,
  });
  const deletePayment = useDeletePaymentMade();

  const handleDelete = async () => {
    if (deleteId) {
      await deletePayment.mutateAsync(deleteId);
      setDeleteId(null);
    }
  };

  const columns: ColumnDef<PaymentMade>[] = [
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
        <Link
          href={`/purchases/payments/${row.original.id}`}
          className="font-mono text-blue-600 hover:underline"
        >
          {row.original.paymentNumber}
        </Link>
      ),
    },
    {
      accessorKey: 'vendor.name',
      header: 'Vendor',
      cell: ({ row }) => row.original.vendor?.name || '-',
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
      cell: ({ row }) => formatPaymentMode(row.original.paymentMode),
    },
    {
      accessorKey: 'reference',
      header: 'Reference',
      meta: { cellClassName: 'font-mono text-sm' },
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
      meta: { headerClassName: 'text-right', cellClassName: 'text-right font-mono font-medium' },
      cell: ({ row }) =>
        formatCurrency(row.original.amount, row.original.vendor?.currency || 'USD'),
    },
    {
      id: 'actions',
      header: '',
      meta: { cellClassName: 'text-right' },
      cell: ({ row }) => {
        const payment = row.original;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm">
                ...
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link href={`/purchases/payments/${payment.id}`}>
                  <Eye className="mr-2 h-4 w-4" />
                  View
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem className="text-red-600" onClick={() => setDeleteId(payment.id)}>
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Payments Made</h1>
          <p className="text-muted-foreground">Track payments made to vendors</p>
        </div>
        <Button asChild>
          <Link href="/purchases/payments/new">
            <Plus className="mr-2 h-4 w-4" />
            Record Payment
          </Link>
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <DataTableSearch
              value={tableParams.search}
              onChange={tableParams.setSearch}
              placeholder="Search payments..."
            />
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
            tableId="payments-made"
            emptyMessage="No payments found"
            emptyAction={
              <Button asChild>
                <Link href="/purchases/payments/new">Record your first payment</Link>
              </Button>
            }
          />
        </CardContent>
      </Card>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Payment</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this payment? This will also update the associated
              bill balances. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default function PaymentsMadePage() {
  return (
    <Suspense>
      <PaymentsMadePageContent />
    </Suspense>
  );
}
