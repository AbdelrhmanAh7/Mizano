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
import { useTranslations } from 'next-intl';
import { Suspense, useState } from 'react';

function ItemsPageContent() {
  const t = useTranslations('inventory');
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
          label={t('items.table.name')}
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
      header: t('items.table.sku'),
      meta: { cellClassName: 'font-mono text-sm' },
      cell: ({ row }) => row.original.sku || '-',
    },
    {
      accessorKey: 'type',
      header: t('items.table.type'),
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
      header: t('items.table.sellingPrice'),
      meta: { headerClassName: 'text-right', cellClassName: 'text-right font-mono' },
      cell: ({ row }) => formatCurrency(row.original.salesPrice || row.original.sellingPrice),
    },
    {
      accessorKey: 'purchasePrice',
      header: t('items.table.costPrice'),
      meta: { headerClassName: 'text-right', cellClassName: 'text-right font-mono' },
      cell: ({ row }) => formatCurrency(row.original.purchasePrice),
    },
    {
      accessorKey: 'currentStock',
      header: t('items.table.stock'),
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
            <span className={cn('font-mono', stockStatus.color)}>{item.currentStock}</span>
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
                  {t('common.view')}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href={`/inventory/items/${item.id}/edit`}>
                  <Pencil className="mr-2 h-4 w-4" />
                  {t('common.edit')}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem className="text-red-600" onClick={() => setDeleteId(item.id)}>
                <Trash2 className="mr-2 h-4 w-4" />
                {t('common.delete')}
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
          <h1 className="text-3xl font-bold tracking-tight">{t('items.title')}</h1>
          <p className="text-muted-foreground">{t('description')}</p>
        </div>
        <Button asChild data-tour="create-item-btn">
          <Link href="/inventory/items/new">
            <Plus className="mr-2 h-4 w-4" />
            {t('items.newItem')}
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
            <SelectItem value="GOODS">{t('items.types.goods')}</SelectItem>
            <SelectItem value="SERVICE">{t('items.types.service')}</SelectItem>
            <SelectItem value="DIGITAL">{t('items.types.digital')}</SelectItem>
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
          emptyMessage={t('items.empty.title')}
          emptyAction={
            <Button asChild>
              <Link href="/inventory/items/new">{t('items.empty.description')}</Link>
            </Button>
          }
        />
      </div>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('items.deleteItem')}</AlertDialogTitle>
            <AlertDialogDescription>{t('common.confirmDelete')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
              {t('common.delete')}
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
