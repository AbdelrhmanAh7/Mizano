'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { Plus, MoreHorizontal, Pencil, Trash2, Eye, MapPin, Star } from 'lucide-react';
import { type ColumnDef } from '@tanstack/react-table';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
          label="Name"
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
            className="font-medium hover:text-blue-600 hover:underline"
          >
            {row.original.name}
          </Link>
          {row.original.isDefault && <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />}
        </div>
      ),
    },
    {
      accessorKey: 'code',
      header: 'Code',
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
      header: 'Items',
      cell: ({ row }) => <span>{row.original._count?.stockLevels || 0} items</span>,
    },
    {
      accessorKey: 'isActive',
      header: 'Status',
      cell: ({ row }) => (
        <Badge variant={row.original.isActive ? 'default' : 'secondary'}>
          {row.original.isActive ? 'Active' : 'Inactive'}
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
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link href={`/inventory/warehouses/${warehouse.id}`}>
                  <Eye className="mr-2 h-4 w-4" />
                  View Stock
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href={`/inventory/warehouses/${warehouse.id}?edit=true`}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem className="text-red-600" onClick={() => setDeleteId(warehouse.id)}>
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
          <h1 className="text-3xl font-bold tracking-tight">Warehouses</h1>
          <p className="text-muted-foreground">Manage your storage locations</p>
        </div>
        <Button asChild>
          <Link href="/inventory/warehouses/new">
            <Plus className="mr-2 h-4 w-4" />
            New Warehouse
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
        emptyMessage="No warehouses found"
        emptyAction={
          <Button asChild>
            <Link href="/inventory/warehouses/new">Create your first warehouse</Link>
          </Button>
        }
      />

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Warehouse</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this warehouse? This action cannot be undone.
              Warehouses with stock cannot be deleted.
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

export default function WarehousesPage() {
  return (
    <Suspense>
      <WarehousesPageContent />
    </Suspense>
  );
}
