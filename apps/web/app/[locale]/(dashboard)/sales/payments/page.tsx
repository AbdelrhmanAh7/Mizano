'use client';

import { useDocumentMoney } from '@/lib/hooks/use-organization';
import { DataTable, DataTableSearch, SortableHeader } from '@/components/data-table';
import { BulkActionConfirmDialog } from '@/components/data-table/bulk-action-confirm';
import { ImportWizard } from '@/components/import/import-wizard';
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
import { paymentsReceivedApi } from '@/lib/api';
import { useBulkAction } from '@/lib/hooks/use-bulk-action';
import type { ImportEntityType } from '@/lib/hooks/use-import-export';
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
import { Eye, Filter, Plus, RefreshCw, Trash2, Upload } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { Suspense, useState } from 'react';

function PaymentsReceivedPageContent() {
  const t = useTranslations('sales');
  const money = useDocumentMoney();
  const { hasPermission } = usePermissions();
  const tableParams = useTableParams({ defaultSortBy: 'date', mode: 'virtual' });

  const [selectedMode, setSelectedMode] = useState<string>('all');
  const [importOpen, setImportOpen] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkSelectedRows, setBulkSelectedRows] = useState<PaymentReceived[]>([]);

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
  const canDelete = hasPermission('sales.delete');

  const bulkDeleteAction = useBulkAction({
    mutationFn: (ids) => paymentsReceivedApi.bulkDelete(ids).then((r) => r.data),
    queryKeys: [['payments-received']],
    successMessage: '{count} payments deleted',
  });

  const bulkActions = [
    ...(canDelete
      ? [
          {
            label: 'Delete',
            icon: Trash2,
            variant: 'destructive' as const,
            onClick: (rows: PaymentReceived[]) => {
              setBulkSelectedRows(rows);
              setBulkDeleteOpen(true);
            },
          },
        ]
      : []),
  ];

  const paymentModeOptions = getPaymentModeOptions();

  const columns: ColumnDef<PaymentReceived>[] = [
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
        <Link href={`/sales/payments/${row.original.id}`} className="font-medium hover:underline">
          {row.original.paymentNumber}
        </Link>
      ),
    },
    {
      accessorKey: 'customer.name',
      header: t('payments.table.customer'),
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
      cell: ({ row }) => <PaymentModeBadge mode={row.original.paymentMode} />,
    },
    {
      accessorKey: 'reference',
      header: t('payments.form.reference'),
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
      meta: {
        headerClassName: 'text-right',
        cellClassName: 'text-right font-mono text-green-600 font-semibold',
      },
      cell: ({ row }) => money(row.original.amount),
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
          <h1 className="text-3xl font-bold tracking-tight">{t('payments.title')}</h1>
          <p className="text-muted-foreground">{t('description')}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            <Upload className="mr-2 h-4 w-4" />
            Import
          </Button>
          {canCreate && (
            <Button asChild>
              <Link href="/sales/payments/new">
                <Plus className="mr-2 h-4 w-4" />
                {t('invoices.recordPayment')}
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
          <CardTitle>{t('payments.title')}</CardTitle>
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
            enableSelection
            bulkActions={bulkActions}
            emptyMessage={t('payments.empty.title')}
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

      {/* Bulk Action Dialogs */}
      <BulkActionConfirmDialog
        open={bulkDeleteOpen}
        onOpenChange={setBulkDeleteOpen}
        action="delete"
        count={bulkSelectedRows.length}
        itemType="payments"
        description="Selected payments will be deleted. Payments linked to reconciled transactions will be skipped."
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
        entityType={'payments_received' as ImportEntityType}
        entityLabel="Payments"
        onComplete={() => refetch()}
      />
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
