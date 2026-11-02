'use client';

import { RowActionsMenu } from '@/components/shared/row-actions-menu';
import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Plus, MapPin, Star } from 'lucide-react';
import { type ColumnDef } from '@tanstack/react-table';
import { Button } from '@/components/ui/button';
import { DeleteConfirmDialog } from '@/components/shared/delete-confirm-dialog';
import { Badge } from '@/components/ui/badge';
import { DataTable, DataTableSearch, SortableHeader } from '@/components/data-table';
import { useTableParams } from '@/lib/hooks/use-table-params';
import {
  useWarehouses,
  useDeleteWarehouse,
  formatWarehouseAddress,
  Warehouse,
} from '@/lib/hooks/use-warehouses';

function WarehousesPageContent() {
  const t = useTranslations('inventory');
  const tableParams = useTableParams({ defaultSortBy: 'name' });
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data, isLoading } = useWarehouses({ ...tableParams.queryParams });
  const deleteWarehouse = useDeleteWarehouse();

  const warehouses: Warehouse[] = data?.data || [];
  const meta = data?.meta;

  const handleDelete = async () => {
    if (deleteId) {
      await deleteWarehouse.mutateAsync(deleteId);
      setDeleteId(null);
    }
  };

  const columns: ColumnDef<Warehouse>[] = [
    {
      accessorKey: 'name',
      header: () => (
        <SortableHeader
          label={t('warehouses.table.name')}
          columnId="name"
          currentSortBy={tableParams.sortBy}
          currentSortOrder={tableParams.sortOrder}
          onSort={tableParams.setSort}
        />
      ),
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <Link
            href={`/inventory/warehouses/${row.original.id}`}
            className="font-medium hover:text-primary hover:underline"
          >
            {row.original.name}
          </Link>
          {row.original.isDefault && <Star className="h-4 w-4 text-warning fill-warning" />}
        </div>
      ),
    },
    {
      accessorKey: 'code',
      header: t('warehouses.table.code'),
      meta: { cellClassName: 'font-mono text-sm' },
      cell: ({ row }) => row.original.code || '-',
    },
    {
      id: 'location',
      header: 'Location',
      cell: ({ row }) => (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <MapPin className="h-4 w-4" />
          <span className="truncate max-w-[200px]">{formatWarehouseAddress(row.original)}</span>
        </div>
      ),
    },
    {
      id: 'items',
      header: t('warehouses.table.itemCount'),
      cell: ({ row }) => <span>{row.original._count?.stockLevels || 0} items</span>,
    },
    {
      accessorKey: 'isActive',
      header: t('warehouses.table.status'),
      cell: ({ row }) => (
        <Badge variant={row.original.isActive ? 'default' : 'secondary'}>
          {row.original.isActive ? t('common.active') : t('common.inactive')}
        </Badge>
      ),
    },
    {
      id: 'actions',
      header: '',
      meta: { cellClassName: 'w-12' },
      cell: ({ row }) => {
        const warehouse = row.original;
        return (
          <RowActionsMenu
            viewHref={`/inventory/warehouses/${warehouse.id}`}
            editHref={`/inventory/warehouses/${warehouse.id}?edit=true`}
            onDelete={() => setDeleteId(warehouse.id)}
            labels={{ view: t('common.view'), edit: t('common.edit'), delete: t('common.delete') }}
          />
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('warehouses.title')}</h1>
          <p className="text-muted-foreground">{t('description')}</p>
        </div>
        <Button asChild>
          <Link href="/inventory/warehouses/new">
            <Plus className="mr-2 h-4 w-4" />
            {t('warehouses.newWarehouse')}
          </Link>
        </Button>
      </div>

      {/* Search */}
      <div className="flex items-center gap-4">
        <DataTableSearch
          value={tableParams.search}
          onChange={tableParams.setSearch}
          placeholder="Search warehouses..."
        />
      </div>

      {/* Table */}
      <DataTable
        columns={columns}
        data={warehouses}
        page={meta?.page || 1}
        totalPages={meta?.totalPages || 1}
        total={meta?.total || 0}
        limit={tableParams.limit}
        onPageChange={tableParams.setPage}
        onLimitChange={tableParams.setLimit}
        isLoading={isLoading}
        emptyMessage={t('warehouses.empty.title')}
        emptyAction={
          <Button asChild>
            <Link href="/inventory/warehouses/new">{t('warehouses.empty.description')}</Link>
          </Button>
        }
      />

      {/* Delete Confirmation */}
      <DeleteConfirmDialog
        open={!!deleteId}
        onOpenChange={() => setDeleteId(null)}
        title={t('warehouses.deleteWarehouse')}
        description={t('common.confirmDelete')}
        onConfirm={handleDelete}
        cancelLabel={t('common.cancel')}
        deleteLabel={t('common.delete')}
      />
    </div>
  );
}

export default function WarehousesPage() {
  return (
    <Suspense>
      <WarehousesPageContent />
    </Suspense>
  );
}
