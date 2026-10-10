'use client';

import { useDocumentMoney } from '@/lib/hooks/use-organization';
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
import { useToast } from '@/components/ui/use-toast';
import { vendorsApi } from '@/lib/api';
import { useBulkAction } from '@/lib/hooks/use-bulk-action';
import { useExportAll } from '@/lib/hooks/use-export-all';
import type { ImportEntityType } from '@/lib/hooks/use-import-export';
import { usePermissions } from '@/lib/hooks/use-permissions';
import { useTableParams } from '@/lib/hooks/use-table-params';
import {
  getBalanceColor,
  useDeleteVendor,
  useInfiniteVendors,
  Vendor,
} from '@/lib/hooks/use-vendors';
import { cn } from '@/lib/utils';
import { type ColumnDef } from '@tanstack/react-table';
import { useTranslations } from 'next-intl';
import { Edit, Eye, Plus, RefreshCw, Trash2, Upload } from 'lucide-react';
import Link from 'next/link';
import { Suspense, useState } from 'react';

function VendorsPageContent() {
  const t = useTranslations('purchases');
  const tCommon = useTranslations('common');
  const money = useDocumentMoney();
  const { toast } = useToast();
  const { hasPermission } = usePermissions();
  const { onExportAll } = useExportAll('vendors', 'vendors');
  const tableParams = useTableParams({ defaultSortBy: 'createdAt', mode: 'virtual' });

  const [importOpen, setImportOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [vendorToDelete, setVendorToDelete] = useState<Vendor | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkSelectedRows, setBulkSelectedRows] = useState<Vendor[]>([]);

  const {
    data: vendors,
    total,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
    isLoading,
    refetch,
  } = useInfiniteVendors({
    ...tableParams.queryParams,
  });
  const deleteVendor = useDeleteVendor();

  const canCreate = hasPermission('purchases.create');
  const canEdit = hasPermission('purchases.edit');
  const canDelete = hasPermission('purchases.delete');

  const bulkDeleteAction = useBulkAction({
    mutationFn: (ids) => vendorsApi.bulkDelete(ids).then((r) => r.data),
    queryKeys: [['vendors']],
    successMessage: '{count} vendors deleted',
  });

  const bulkActions = [
    ...(canDelete
      ? [
          {
            label: 'Delete',
            icon: Trash2,
            variant: 'destructive' as const,
            onClick: (rows: Vendor[]) => {
              setBulkSelectedRows(rows);
              setBulkDeleteOpen(true);
            },
          },
        ]
      : []),
  ];

  const handleDelete = (vendor: Vendor) => {
    setVendorToDelete(vendor);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (vendorToDelete) {
      try {
        await deleteVendor.mutateAsync(vendorToDelete.id);
        toast({
          title: t('vendors.toast.deleted'),
          description: t('vendors.toast.deletedDescription', { name: vendorToDelete.name }),
        });
      } catch (error: unknown) {
        toast({
          title: tCommon('errors.generic'),
          description:
            (error as { response?: { data?: { message?: string } } }).response?.data?.message ||
            t('vendors.toast.deleteError'),
          variant: 'destructive',
        });
      }
      setDeleteDialogOpen(false);
      setVendorToDelete(null);
    }
  };

  const columns: ColumnDef<Vendor>[] = [
    {
      accessorKey: 'name',
      header: () => (
        <SortableHeader
          label={t('vendors.table.name')}
          columnId="name"
          currentSortBy={tableParams.sortBy}
          currentSortOrder={tableParams.sortOrder}
          onSort={tableParams.setSort}
        />
      ),
      cell: ({ row }) => {
        const vendor = row.original;
        return (
          <div>
            <Link href={`/purchases/vendors/${vendor.id}`} className="font-medium hover:underline">
              {vendor.displayName || vendor.name}
            </Link>
            {vendor.displayName && vendor.displayName !== vendor.name && (
              <p className="text-sm text-muted-foreground">{vendor.name}</p>
            )}
          </div>
        );
      },
    },
    {
      accessorKey: 'email',
      header: t('vendors.table.email'),
      cell: ({ row }) => row.original.email || '-',
    },
    {
      accessorKey: 'phone',
      header: t('vendors.table.phone'),
      cell: ({ row }) => row.original.phone || '-',
    },
    {
      accessorKey: 'currency',
      header: tCommon('currency'),
    },
    {
      accessorKey: 'outstandingBalance',
      header: () => (
        <SortableHeader
          label={t('vendors.table.payable')}
          columnId="outstandingBalance"
          currentSortBy={tableParams.sortBy}
          currentSortOrder={tableParams.sortOrder}
          onSort={tableParams.setSort}
        />
      ),
      meta: { headerClassName: 'text-right', cellClassName: 'text-right' },
      cell: ({ row }) => {
        const balance = parseFloat(row.original.outstandingBalance || '0');
        return (
          <span className={cn('font-mono font-medium', getBalanceColor(balance))}>
            {money(balance, row.original.currency)}
          </span>
        );
      },
    },
    {
      id: 'actions',
      header: '',
      meta: { cellClassName: 'text-right' },
      cell: ({ row }) => {
        const vendor = row.original;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm">
                ...
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link href={`/purchases/vendors/${vendor.id}`}>
                  <Eye className="mr-2 h-4 w-4" />
                  {tCommon('buttons.view')}
                </Link>
              </DropdownMenuItem>
              {canEdit && (
                <DropdownMenuItem asChild>
                  <Link href={`/purchases/vendors/${vendor.id}/edit`}>
                    <Edit className="mr-2 h-4 w-4" />
                    {tCommon('buttons.edit')}
                  </Link>
                </DropdownMenuItem>
              )}
              {canDelete && (
                <DropdownMenuItem onClick={() => handleDelete(vendor)} className="text-red-600">
                  <Trash2 className="mr-2 h-4 w-4" />
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
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('vendors.title')}</h1>
          <p className="text-muted-foreground">{t('description')}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            <Upload className="mr-2 h-4 w-4" />
            Import
          </Button>
          {canCreate && (
            <Button asChild>
              <Link href="/purchases/vendors/new">
                <Plus className="mr-2 h-4 w-4" />
                {t('vendors.newVendor')}
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
              placeholder={t('vendors.searchPlaceholder')}
            />
            <Button
              variant="outline"
              size="icon"
              onClick={() => refetch()}
              aria-label={t('vendors.refreshVendors')}
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Vendors Table */}
      <Card>
        <CardHeader>
          <CardTitle>{t('vendors.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            data={vendors}
            total={total}
            isLoading={isLoading}
            enableVirtualization
            hasNextPage={hasNextPage}
            isFetchingNextPage={isFetchingNextPage}
            onLoadMore={() => fetchNextPage()}
            enableColumnResizing
            tableId="vendors"
            enableSelection
            enableExport
            enableColumnVisibility
            exportFilename="vendors"
            onExportAll={onExportAll}
            bulkActions={bulkActions}
            emptyMessage={t('vendors.empty.title')}
            emptyAction={
              canCreate ? (
                <Button asChild>
                  <Link href="/purchases/vendors/new">
                    <Plus className="mr-2 h-4 w-4" />
                    {t('vendors.newVendor')}
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
        itemType="vendors"
        description="Selected vendors will be deleted. Vendors with transactions will be skipped."
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
        entityType={'vendors' as ImportEntityType}
        entityLabel="Vendors"
        onComplete={() => refetch()}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('vendors.deleteVendor')}</AlertDialogTitle>
            <AlertDialogDescription>{tCommon('confirm.deleteMessage')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tCommon('buttons.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-red-600 hover:bg-red-700">
              {tCommon('buttons.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default function VendorsPage() {
  return (
    <Suspense>
      <VendorsPageContent />
    </Suspense>
  );
}
