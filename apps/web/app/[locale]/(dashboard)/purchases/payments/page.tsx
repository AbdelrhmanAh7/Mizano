'use client';

import { useTranslations } from 'next-intl';
import { DataTable, DataTableSearch, SortableHeader } from '@/components/data-table';
import { BulkActionConfirmDialog } from '@/components/data-table/bulk-action-confirm';
import { ImportWizard } from '@/components/import/import-wizard';
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
import { paymentsMadeApi } from '@/lib/api';
import { useBulkAction } from '@/lib/hooks/use-bulk-action';
import type { ImportEntityType } from '@/lib/hooks/use-import-export';
import {
  formatCurrency,
  formatPaymentMode,
  PaymentMade,
  useDeletePaymentMade,
  useInfinitePaymentsMade,
} from '@/lib/hooks/use-payments-made';
import { usePermissions } from '@/lib/hooks/use-permissions';
import { useTableParams } from '@/lib/hooks/use-table-params';
import { type ColumnDef } from '@tanstack/react-table';
import { format } from 'date-fns';
import { Eye, Plus, Trash2, Upload } from 'lucide-react';
import Link from 'next/link';
import { Suspense, useState } from 'react';

function PaymentsMadePageContent() {
  const t = useTranslations('purchases');
  const tCommon = useTranslations('common');
  const { hasPermission } = usePermissions();
  const tableParams = useTableParams({ defaultSortBy: 'date', mode: 'virtual' });

  const [importOpen, setImportOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkSelectedRows, setBulkSelectedRows] = useState<PaymentMade[]>([]);

  const {
    data: payments,
    total,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
    isLoading,
    refetch,
  } = useInfinitePaymentsMade({
    ...tableParams.queryParams,
  });
  const deletePayment = useDeletePaymentMade();

  const canDelete = hasPermission('purchases.delete');

  const bulkDeleteAction = useBulkAction({
    mutationFn: (ids) => paymentsMadeApi.bulkDelete(ids).then((r) => r.data),
    queryKeys: [['payments-made']],
    successMessage: '{count} payments deleted',
  });

  const bulkActions = [
    ...(canDelete
      ? [
          {
            label: 'Delete',
            icon: Trash2,
            variant: 'destructive' as const,
            onClick: (rows: PaymentMade[]) => {
              setBulkSelectedRows(rows);
              setBulkDeleteOpen(true);
            },
          },
        ]
      : []),
  ];

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
          label={t('payments.table.paymentNumber')}
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
      header: t('payments.table.vendor'),
      cell: ({ row }) => row.original.vendor?.name || '-',
    },
    {
      accessorKey: 'date',
      header: () => (
        <SortableHeader
          label={t('payments.table.date')}
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
      header: t('payments.table.mode'),
      cell: ({ row }) => formatPaymentMode(row.original.paymentMode),
    },
    {
      accessorKey: 'reference',
      header: t('payments.table.reference'),
      meta: { cellClassName: 'font-mono text-sm' },
      cell: ({ row }) => row.original.reference || '-',
    },
    {
      accessorKey: 'amount',
      header: () => (
        <SortableHeader
          label={t('payments.table.amount')}
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
                  {tCommon('buttons.view')}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem className="text-red-600" onClick={() => setDeleteId(payment.id)}>
                <Trash2 className="mr-2 h-4 w-4" />
                {tCommon('buttons.delete')}
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
          <h1 className="text-3xl font-bold tracking-tight">{t('payments.title')}</h1>
          <p className="text-muted-foreground">{t('payments.pageDescription')}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            <Upload className="mr-2 h-4 w-4" />
            Import
          </Button>
          <Button asChild>
            <Link href="/purchases/payments/new">
              <Plus className="mr-2 h-4 w-4" />
              {t('payments.recordPayment')}
            </Link>
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <DataTableSearch
              value={tableParams.search}
              onChange={tableParams.setSearch}
              placeholder={t('payments.searchPlaceholder')}
            />
          </div>
        </CardContent>
      </Card>

      {/* Payments Table */}
      <Card>
        <CardHeader>
          <CardTitle>{t('payments.allPayments')}</CardTitle>
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
            enableSelection
            bulkActions={bulkActions}
            emptyMessage={t('payments.noPayments')}
            emptyAction={
              <Button asChild>
                <Link href="/purchases/payments/new">{t('payments.recordFirst')}</Link>
              </Button>
            }
          />
        </CardContent>
      </Card>

      {/* Bulk Action Dialogs */}
      <BulkActionConfirmDialog
        open={bulkDeleteOpen}
        onOpenChange={setBulkDeleteOpen}
        action="delete"
        count={bulkSelectedRows.length}
        itemType="payments"
        description="Selected payments will be permanently deleted."
        destructive
        isLoading={bulkDeleteAction.isLoading}
        onConfirm={async () => {
          await bulkDeleteAction.execute(bulkSelectedRows.map((r) => r.id));
          setBulkDeleteOpen(false);
          refetch();
        }}
      />

      {/* Import Wizard */}
      <ImportWizard
        open={importOpen}
        onOpenChange={setImportOpen}
        entityType={'payments_made' as ImportEntityType}
        entityLabel="Payments Made"
        onComplete={() => refetch()}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('payments.deleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('payments.deleteConfirmation')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tCommon('buttons.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
              {tCommon('buttons.delete')}
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
