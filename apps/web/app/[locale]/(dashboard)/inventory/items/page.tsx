'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Plus, Search, MoreHorizontal, Pencil, Trash2, Eye, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import {
  useItems,
  useDeleteItem,
  getItemTypeLabel,
  getItemTypeColor,
  getStockStatus,
  formatCurrency,
  Item,
  ItemType,
} from '@/lib/hooks/use-items';

export default function ItemsPage() {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [stockFilter, setStockFilter] = useState<string>('all');
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data, isLoading } = useItems({
    search,
    type: typeFilter !== 'all' ? (typeFilter as ItemType) : undefined,
    lowStock: stockFilter === 'low' ? true : undefined,
  });

  const deleteItem = useDeleteItem();

  const items: Item[] = data?.data || [];

  const handleDelete = async () => {
    if (deleteId) {
      await deleteItem.mutateAsync(deleteId);
      setDeleteId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-10 w-32" />
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Items</h1>
          <p className="text-muted-foreground">
            Manage products and services
          </p>
        </div>
        <Button asChild>
          <Link href="/inventory/items/new">
            <Plus className="mr-2 h-4 w-4" />
            New Item
          </Link>
        </Button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search items..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
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

      {/* Table */}
      {items.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground">No items found</p>
          <Button asChild className="mt-4">
            <Link href="/inventory/items/new">Create your first item</Link>
          </Button>
        </div>
      ) : (
        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Sales Price</TableHead>
                <TableHead className="text-right">Purchase Price</TableHead>
                <TableHead className="text-right">Stock</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => {
                const stockStatus = getStockStatus(item);
                return (
                  <TableRow key={item.id}>
                    <TableCell>
                      <Link
                        href={`/inventory/items/${item.id}`}
                        className="font-medium hover:text-blue-600 hover:underline"
                      >
                        {item.name}
                      </Link>
                      {item.description && (
                        <p className="text-sm text-muted-foreground truncate max-w-[200px]">
                          {item.description}
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {item.sku || '-'}
                    </TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                          getItemTypeColor(item.type)
                        )}
                      >
                        {getItemTypeLabel(item.type)}
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {formatCurrency(item.salesPrice || item.sellingPrice)}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {formatCurrency(item.purchasePrice)}
                    </TableCell>
                    <TableCell className="text-right">
                      {item.trackInventory ? (
                        <div className="flex items-center justify-end gap-2">
                          {stockStatus.status === 'low' && (
                            <AlertTriangle className="h-4 w-4 text-yellow-500" />
                          )}
                          {stockStatus.status === 'out' && (
                            <AlertTriangle className="h-4 w-4 text-red-500" />
                          )}
                          <span className={cn('font-mono', stockStatus.color)}>
                            {item.stockLevel}
                          </span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
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
                          <DropdownMenuItem
                            className="text-red-600"
                            onClick={() => setDeleteId(item.id)}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Item</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this item? This action cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
