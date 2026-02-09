'use client';

import { InventoryAIPanel } from '@/components/ai';
import { DataTable, DataTableSearch, SortableHeader } from '@/components/data-table';
import { AutoTourTrigger } from '@/components/tour/auto-tour-trigger';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useExportAll } from '@/lib/hooks/use-export-all';
import {
  formatCurrency,
  getItemTypeColor,
  getItemTypeLabel,
  getStockStatus,
  Item,
  ItemType,
  useDeleteItem,
  useInfiniteItems,
} from '@/lib/hooks/use-items';
import { useTableParams } from '@/lib/hooks/use-table-params';
import { cn } from '@/lib/utils';
import { type ColumnDef } from '@tanstack/react-table';
import { AlertTriangle, Eye, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { Suspense, useState } from 'react';

function ItemsPageContent() {
  const tableParams = useTableParams({ defaultSortBy: 'name', mode: 'virtual' });
  const { onExportAll } = useExportAll('items', 'items');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [stockFilter, setStockFilter] = useState<string>('all');
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const {
    data: items,
    total,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
    isLoading,
    refetch,
  } = useInfiniteItems({
    ...tableParams.queryParams,
    type: typeFilter !== 'all' ? (typeFilter as ItemType) : undefined,
    lowStock: stockFilter === 'low' ? true : undefined,
  });

  const deleteItem = useDeleteItem();

  const handleDelete = async () => {
    if (deleteId) {
      await deleteItem.mutateAsync(deleteId);
      setDeleteId(null);
    }
  };

  const columns: ColumnDef<Item>[] = [
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
        <div>
          <Link
            href={`/inventory/items/${row.original.id}`}
            className="font-medium hover:text-blue-600 hover:underline"
          >
            {row.original.name}
          </Link>
          {row.original.description && (
            <p className="text-sm text-muted-foreground truncate max-w-[200px]">
              {row.original.description}
            </p>
          )}
        </div>
      ),
    },
    {
      accessorKey: 'sku',
      header: 'SKU',
      meta: { cellClassName: 'font-mono text-sm' },
      cell: ({ row }) => row.original.sku || '-',
    },
    {
      accessorKey: 'type',
      header: 'Type',
      cell: ({ row }) => (
        <span
          className={cn(
            'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
            getItemTypeColor(row.original.type),
          )}
        >
          {getItemTypeLabel(row.original.type)}
        </span>
      ),
    },
    {
      accessorKey: 'salesPrice',
      header: 'Sales Price',
      meta: { headerClassName: 'text-right', cellClassName: 'text-right font-mono' },
      cell: ({ row }) => formatCurrency(row.original.salesPrice || row.original.sellingPrice),
    },
    {
      accessorKey: 'purchasePrice',
      header: 'Purchase Price',
      meta: { headerClassName: 'text-right', cellClassName: 'text-right font-mono' },
      cell: ({ row }) => formatCurrency(row.original.purchasePrice),
    },
    {
      accessorKey: 'stockLevel',
      header: 'Stock',
      meta: { headerClassName: 'text-right', cellClassName: 'text-right' },
      cell: ({ row }) => {
        const item = row.original;
        if (!item.trackInventory) {
          return <span className="text-muted-foreground">-</span>;
        }
        const stockStatus = getStockStatus(item);
        return (
          <div className="flex items-center justify-end gap-2">
            {stockStatus.status === 'low' && <AlertTriangle className="h-4 w-4 text-yellow-500" />}
            {stockStatus.status === 'out' && <AlertTriangle className="h-4 w-4 text-red-500" />}
            <span className={cn('font-mono', stockStatus.color)}>{item.stockLevel}</span>
          </div>
        );
      },
    },
    {
      id: 'actions',
      header: '',
      meta: { cellClassName: 'w-12' },
      cell: ({ row }) => {
        const item = row.original;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link href={`/inventory/items/${item.id}`}>
                  <Eye className="mr-2 h-4 w-4" />
                  View
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href={`/inventory/items/${item.id}/edit`}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem className="text-red-600" onClick={() => setDeleteId(item.id)}>
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
      <AutoTourTrigger tourId="inventory_items" />
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Items</h1>
          <p className="text-muted-foreground">Manage products and services</p>
        </div>
        <Button asChild data-tour="create-item-btn">
          <Link href="/inventory/items/new">
            <Plus className="mr-2 h-4 w-4" />
            New Item
          </Link>
        </Button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4">
        <DataTableSearch
          value={tableParams.search}
          onChange={tableParams.setSearch}
          placeholder="Search items..."
        />
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-32">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="GOODS">Goods</SelectItem>
            <SelectItem value="SERVICE">Service</SelectItem>
            <SelectItem value="DIGITAL">Digital</SelectItem>
          </SelectContent>
        </Select>
        <Select value={stockFilter} onValueChange={setStockFilter}>
          <SelectTrigger className="w-32">
            <SelectValue placeholder="Stock" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Stock</SelectItem>
            <SelectItem value="low">Low Stock</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* AI Panel */}
      <InventoryAIPanel />

      {/* Table */}
      <div data-tour="item-list">
        <DataTable
          columns={columns}
          data={items}
          total={total}
          isLoading={isLoading}
          enableVirtualization
          hasNextPage={hasNextPage}
          isFetchingNextPage={isFetchingNextPage}
          onLoadMore={() => fetchNextPage()}
          enableColumnResizing
          tableId="items"
          onExportAll={onExportAll}
          emptyMessage="No items found"
          emptyAction={
            <Button asChild>
              <Link href="/inventory/items/new">Create your first item</Link>
            </Button>
          }
        />
      </div>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Item</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this item? This action cannot be undone.
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

export default function ItemsPage() {
  return (
    <Suspense>
      <ItemsPageContent />
    </Suspense>
  );
}
