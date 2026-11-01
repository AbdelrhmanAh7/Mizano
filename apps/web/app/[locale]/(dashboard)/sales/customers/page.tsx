'use client';

import { DataTable, DataTableSearch, SortableHeader } from '@/components/data-table';
import { BulkActionConfirmDialog } from '@/components/data-table/bulk-action-confirm';
import { ImportWizard } from '@/components/import/import-wizard';
import { AutoTourTrigger } from '@/components/tour/auto-tour-trigger';
import { DeleteConfirmDialog } from '@/components/shared/delete-confirm-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Customer,
  getBalanceColor,
  useDeleteCustomer,
  useInfiniteCustomers,
} from '@/lib/hooks/use-customers';
import { customersApi } from '@/lib/api';
import { useBulkAction } from '@/lib/hooks/use-bulk-action';
import { useExportAll } from '@/lib/hooks/use-export-all';
import type { ImportEntityType } from '@/lib/hooks/use-import-export';
import { useMoneyFormatter } from '@/lib/hooks/use-money-formatter';
import { usePermissions } from '@/lib/hooks/use-permissions';
import { useTableParams } from '@/lib/hooks/use-table-params';
import { cn } from '@/lib/utils';
import { type ColumnDef } from '@tanstack/react-table';
import { Edit, Eye, Plus, RefreshCw, Trash2, Upload } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { Suspense, useState } from 'react';

function CustomersPageContent() {
  const t = useTranslations('sales');
  const tCommon = useTranslations('common');
  // Balances are ledger (AR) amounts, so they are in the base currency, not in
  // Customer.currency (a USD schema default).
  const formatCurrency = useMoneyFormatter();
  const { hasPermission } = usePermissions();
  const { onExportAll } = useExportAll('customers', 'customers');
  const tableParams = useTableParams({ defaultSortBy: 'createdAt', mode: 'virtual' });

  const [importOpen, setImportOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [customerToDelete, setCustomerToDelete] = useState<Customer | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkSelectedRows, setBulkSelectedRows] = useState<Customer[]>([]);

  const {
    data: customers,
    total,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
    isLoading,
    refetch,
  } = useInfiniteCustomers({
    ...tableParams.queryParams,
  });
  const deleteCustomer = useDeleteCustomer();

  const canCreate = hasPermission('sales.create');
  const canEdit = hasPermission('sales.edit');
  const canDelete = hasPermission('sales.delete');

  const bulkDeleteAction = useBulkAction({
    mutationFn: (ids) => customersApi.bulkDelete(ids).then((r) => r.data),
    queryKeys: [['customers']],
    successMessage: (count) => t('customers.bulkDelete.success', { count }),
  });

  const bulkActions = [
    ...(canDelete
      ? [
          {
            label: tCommon('buttons.delete'),
            icon: Trash2,
            variant: 'destructive' as const,
            onClick: (rows: Customer[]) => {
              setBulkSelectedRows(rows);
              setBulkDeleteOpen(true);
            },
          },
        ]
      : []),
  ];

  const handleDelete = (customer: Customer) => {
    setCustomerToDelete(customer);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (customerToDelete) {
      try {
        await deleteCustomer.mutateAsync(customerToDelete.id);
      } catch {
        // useDeleteCustomer shows the translated success and error toasts.
      }
      setDeleteDialogOpen(false);
      setCustomerToDelete(null);
    }
  };

  const columns: ColumnDef<Customer>[] = [
    {
      accessorKey: 'name',
      header: () => (
        <SortableHeader
          label={t('customers.table.name')}
          columnId="name"
          currentSortBy={tableParams.sortBy}
          currentSortOrder={tableParams.sortOrder}
          onSort={tableParams.setSort}
        />
      ),
      cell: ({ row }) => {
        const customer = row.original;
        return (
          <div>
            <Link href={`/sales/customers/${customer.id}`} className="font-medium hover:underline">
              {customer.displayName || customer.name}
            </Link>
            {customer.displayName && customer.displayName !== customer.name && (
              <p className="text-sm text-muted-foreground">{customer.name}</p>
            )}
          </div>
        );
      },
    },
    {
      accessorKey: 'email',
      header: t('customers.table.email'),
      cell: ({ row }) => row.original.email || '-',
    },
    {
      accessorKey: 'phone',
      header: t('customers.table.phone'),
      cell: ({ row }) => (row.original.phone ? <span dir="ltr">{row.original.phone}</span> : '-'),
    },
    {
      accessorKey: 'currency',
      header: tCommon('currency'),
    },
    {
      accessorKey: 'outstandingBalance',
      header: () => (
        <SortableHeader
          label={t('customers.table.outstanding')}
          columnId="outstandingBalance"
          currentSortBy={tableParams.sortBy}
          currentSortOrder={tableParams.sortOrder}
          onSort={tableParams.setSort}
        />
      ),
      meta: { headerClassName: 'text-end', cellClassName: 'text-end' },
      cell: ({ row }) => {
        const balance = parseFloat(row.original.outstandingBalance || '0');
        return (
          <span className={cn('font-mono font-medium', getBalanceColor(balance))}>
            {formatCurrency(balance)}
          </span>
        );
      },
    },
    {
      id: 'actions',
      header: '',
      meta: { cellClassName: 'text-end' },
      cell: ({ row }) => {
        const customer = row.original;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm">
                ...
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link href={`/sales/customers/${customer.id}`}>
                  <Eye className="me-2 h-4 w-4" />
                  {tCommon('buttons.view')}
                </Link>
              </DropdownMenuItem>
              {canEdit && (
                <DropdownMenuItem asChild>
                  <Link href={`/sales/customers/${customer.id}/edit`}>
                    <Edit className="me-2 h-4 w-4" />
                    {tCommon('buttons.edit')}
                  </Link>
                </DropdownMenuItem>
              )}
              {canDelete && (
                <DropdownMenuItem onClick={() => handleDelete(customer)} className="text-red-600">
                  <Trash2 className="me-2 h-4 w-4" />
                  {tCommon('buttons.delete')}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      <AutoTourTrigger tourId="sales_customers" />
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('customers.title')}</h1>
          <p className="text-muted-foreground">{t('description')}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            <Upload className="me-2 h-4 w-4" />
            {tCommon('buttons.import')}
          </Button>
          {canCreate && (
            <Button asChild data-tour="create-customer-btn">
              <Link href="/sales/customers/new">
                <Plus className="me-2 h-4 w-4" />
                {t('customers.newCustomer')}
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
              placeholder={t('customers.list.searchPlaceholder')}
            />
            <Button
              variant="outline"
              size="icon"
              onClick={() => refetch()}
              aria-label={t('customers.list.refresh')}
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Customers Table */}
      <Card data-tour="customer-list">
        <CardHeader>
          <CardTitle>{t('customers.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            data={customers}
            total={total}
            isLoading={isLoading}
            enableVirtualization
            hasNextPage={hasNextPage}
            isFetchingNextPage={isFetchingNextPage}
            onLoadMore={() => fetchNextPage()}
            enableColumnResizing
            tableId="customers"
            enableSelection
            bulkActions={bulkActions}
            enableExport
            enableColumnVisibility
            exportFilename="customers"
            onExportAll={onExportAll}
            emptyMessage={t('customers.empty.title')}
            emptyAction={
              canCreate ? (
                <Button asChild>
                  <Link href="/sales/customers/new">
                    <Plus className="me-2 h-4 w-4" />
                    {t('customers.empty.action')}
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
        itemType="customers"
        title={t('customers.bulkDelete.title', { count: bulkSelectedRows.length })}
        description={t('customers.bulkDelete.description')}
        confirmLabel={t('customers.bulkDelete.confirm', { count: bulkSelectedRows.length })}
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
        entityType={'customers' as ImportEntityType}
        entityLabel={t('customers.list.importLabel')}
        onComplete={() => refetch()}
      />

      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title={t('customers.deleteCustomer')}
        description={t('customers.deleteConfirmName', { name: customerToDelete?.name ?? '' })}
        onConfirm={confirmDelete}
      />
    </div>
  );
}

export default function CustomersPage() {
  return (
    <Suspense>
      <CustomersPageContent />
    </Suspense>
  );
}
