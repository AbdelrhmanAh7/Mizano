'use client';

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
import { useMoneyFormatter } from '@/lib/hooks/use-money-formatter';
import { usePermissions } from '@/lib/hooks/use-permissions';
import { useTableParams } from '@/lib/hooks/use-table-params';
import { type ColumnDef } from '@tanstack/react-table';
import { format } from 'date-fns';
import { Eye, Filter, Plus, RefreshCw, Trash2, Upload } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { Suspense, useState } from 'react';
import { useDateFnsLocale } from '@/lib/date-locale';

// Labels live under common.paymentModes.
const PAYMENT_MODE_KEYS: Record<PaymentMode, string> = {
  CASH: 'cash',
  BANK_TRANSFER: 'bankTransfer',
  CREDIT_CARD: 'creditCard',
  DEBIT_CARD: 'debitCard',
  CHEQUE: 'cheque',
  ONLINE: 'online',
  OTHER: 'other',
};

function PaymentsReceivedPageContent() {
  const dateLocale = useDateFnsLocale();
  const t = useTranslations('sales');
  const tCommon = useTranslations('common');
  const tModes = useTranslations('common.paymentModes');
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
    successMessage: (count) => t('payments.bulkDelete.success', { count }),
  });

  const bulkActions = [
    ...(canDelete
      ? [
          {
            label: tCommon('buttons.delete'),
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

  // Customer payments are posted in the organization base currency, so they are shown in it.
  const formatCurrency = useMoneyFormatter();

  const paymentModeOptions = getPaymentModeOptions().map((option) => ({
    ...option,
    label: tModes(PAYMENT_MODE_KEYS[option.value]),
  }));

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
      cell: ({ row }) => format(new Date(row.original.date), 'PP', { locale: dateLocale }),
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
        headerClassName: 'text-end',
        cellClassName: 'text-end font-mono text-green-600 font-semibold',
      },
      cell: ({ row }) => formatCurrency(row.original.amount),
    },
    {
      id: 'actions',
      header: '',
      meta: { cellClassName: 'text-end' },
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
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('payments.title')}</h1>
          <p className="text-muted-foreground">{t('description')}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            <Upload className="me-2 h-4 w-4" />
            {tCommon('buttons.import')}
          </Button>
          {canCreate && (
            <Button asChild>
              <Link href="/sales/payments/new">
                <Plus className="me-2 h-4 w-4" />
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
              placeholder={t('payments.list.searchPlaceholder')}
            />
            <Select value={selectedMode} onValueChange={setSelectedMode}>
              <SelectTrigger className="w-[180px]">
                <Filter className="me-2 h-4 w-4" />
                <SelectValue placeholder={t('payments.list.filterByMode')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('payments.list.allModes')}</SelectItem>
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
              aria-label={t('payments.list.refresh')}
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
                    <Plus className="me-2 h-4 w-4" />
                    {t('payments.empty.action')}
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
        title={t('payments.bulkDelete.title', { count: bulkSelectedRows.length })}
        description={t('payments.bulkDelete.description')}
        confirmLabel={t('payments.bulkDelete.confirm', { count: bulkSelectedRows.length })}
        cancelLabel={tCommon('buttons.cancel')}
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
        entityLabel={t('payments.list.importLabel')}
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
