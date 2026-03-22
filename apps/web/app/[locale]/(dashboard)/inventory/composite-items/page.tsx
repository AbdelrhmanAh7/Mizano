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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  CompositeItem,
  formatCurrency,
  useDeleteCompositeItem,
  useInfiniteCompositeItems,
} from '@/lib/hooks/use-composite-items';
import { useTableParams } from '@/lib/hooks/use-table-params';
import { type ColumnDef } from '@tanstack/react-table';
import { Eye, Layers, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { Suspense, useState } from 'react';

function CompositeItemsPageContent() {
  const tableParams = useTableParams({ defaultSortBy: 'name', mode: 'virtual' });
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const {
    data: compositeItems,
    total,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
    isLoading,
  } = useInfiniteCompositeItems(tableParams.queryParams);

  const deleteCompositeItem = useDeleteCompositeItem();

  const handleDelete = async () => {
    if (deleteId) {
      await deleteCompositeItem.mutateAsync(deleteId);
      setDeleteId(null);
    }
  };

  const columns: ColumnDef<CompositeItem>[] = [
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
        <Link
          href={`/inventory/composite-items/${row.original.id}`}
          className="font-medium hover:text-blue-600 hover:underline"
        >
          {row.original.name}
        </Link>
      ),
    },
    {
      accessorKey: 'sku',
      header: 'SKU',
      meta: { cellClassName: 'font-mono text-sm' },
    },
    {
      accessorKey: 'sellingPrice',
      header: 'Selling Price',
      meta: { headerClassName: 'text-right', cellClassName: 'text-right font-mono' },
      cell: ({ row }) => formatCurrency(row.original.sellingPrice),
    },
    {
      id: 'componentCount',
      header: 'Components',
      meta: { headerClassName: 'text-center', cellClassName: 'text-center' },
      cell: ({ row }) => (
        <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
          {row.original.components?.length || 0}
        </span>
      ),
    },
    {
      id: 'actions',
      header: '',
      meta: { cellClassName: 'w-12' },
      cell: ({ row }) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <Link href={`/inventory/composite-items/${row.original.id}`}>
                <Eye className="mr-2 h-4 w-4" />
                View
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href={`/inventory/composite-items/${row.original.id}?edit=true`}>
                <Pencil className="mr-2 h-4 w-4" />
                Edit
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem className="text-red-600" onClick={() => setDeleteId(row.original.id)}>
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Composite Items</h1>
          <p className="text-muted-foreground">
            Manage bundled products made from multiple component items.
          </p>
        </div>
        <Button asChild>
          <Link href="/inventory/composite-items/new">
            <Plus className="mr-2 h-4 w-4" />
            New Composite Item
          </Link>
        </Button>
      </div>

      <div className="flex items-center gap-4">
        <DataTableSearch
          value={tableParams.search}
          onChange={tableParams.setSearch}
          placeholder="Search composite items..."
        />
      </div>

      <DataTable
        columns={columns}
        data={compositeItems}
        total={total}
        isLoading={isLoading}
        enableVirtualization
        hasNextPage={hasNextPage}
        isFetchingNextPage={isFetchingNextPage}
        onLoadMore={() => fetchNextPage()}
        enableColumnResizing
        tableId="composite-items"
        emptyMessage="No composite items found"
        emptyAction={
          <div className="flex flex-col items-center gap-3">
            <Layers className="h-10 w-10 text-muted-foreground" />
            <Button asChild>
              <Link href="/inventory/composite-items/new">Create your first composite item</Link>
            </Button>
          </div>
        }
      />

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Composite Item</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this composite item? This action cannot be undone.
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

export default function CompositeItemsPage() {
  return (
    <Suspense>
      <CompositeItemsPageContent />
    </Suspense>
  );
}
