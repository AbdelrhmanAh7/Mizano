'use client';

import { use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Pencil, Trash2, Package, DollarSign, TrendingUp, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import {
  useItem,
  useDeleteItem,
  getItemTypeLabel,
  getItemTypeColor,
  getStockStatus,
  formatCurrency,
} from '@/lib/hooks/use-items';

interface ItemDetailPageProps {
  params: Promise<{ id: string }>;
}

export default function ItemDetailPage({ params }: ItemDetailPageProps) {
  const { id } = use(params);
  const router = useRouter();
  const { data: item, isLoading } = useItem(id);
  const deleteItem = useDeleteItem();

  const handleDelete = async () => {
    await deleteItem.mutateAsync(id);
    router.push('/inventory/items');
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (!item) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Item not found</p>
        <Button asChild className="mt-4">
          <Link href="/inventory/items">Back to Items</Link>
        </Button>
      </div>
    );
  }

  const stockStatus = getStockStatus(item);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/inventory/items">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight">{item.name}</h1>
              <span
                className={cn(
                  'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
                  getItemTypeColor(item.type)
                )}
              >
                {getItemTypeLabel(item.type)}
              </span>
            </div>
            {item.sku && (
              <p className="text-muted-foreground font-mono">SKU: {item.sku}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" asChild>
            <Link href={`/inventory/items/${id}/edit`}>
              <Pencil className="mr-2 h-4 w-4" />
              Edit
            </Link>
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" className="text-red-600">
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Item</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to delete this item? This action cannot
                  be undone.
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
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <DollarSign className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Sales Price</p>
                <p className="text-2xl font-bold font-mono">
                  {formatCurrency(item.salesPrice || item.sellingPrice)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <TrendingUp className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Purchase Price</p>
                <p className="text-2xl font-bold font-mono">
                  {formatCurrency(item.purchasePrice)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 rounded-lg">
                <Package className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Stock Level</p>
                {item.trackInventory ? (
                  <p className={cn('text-2xl font-bold font-mono', stockStatus.color)}>
                    {item.stockLevel} {item.unit || 'units'}
                  </p>
                ) : (
                  <p className="text-2xl font-bold text-muted-foreground">N/A</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div
                className={cn(
                  'p-2 rounded-lg',
                  stockStatus.status === 'ok'
                    ? 'bg-green-100'
                    : stockStatus.status === 'low'
                    ? 'bg-yellow-100'
                    : 'bg-red-100'
                )}
              >
                {stockStatus.status !== 'ok' ? (
                  <AlertTriangle
                    className={cn(
                      'h-5 w-5',
                      stockStatus.status === 'low' ? 'text-yellow-600' : 'text-red-600'
                    )}
                  />
                ) : (
                  <Package className="h-5 w-5 text-green-600" />
                )}
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Status</p>
                <p className={cn('text-lg font-semibold', stockStatus.color)}>
                  {stockStatus.label}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Details */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Item Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Type</span>
              <span
                className={cn(
                  'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                  getItemTypeColor(item.type)
                )}
              >
                {getItemTypeLabel(item.type)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Unit</span>
              <span>{item.unit || '-'}</span>
            </div>
            {item.taxRate && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tax Rate</span>
                <span>
                  {item.taxRate.name} ({item.taxRate.rate}%)
                </span>
              </div>
            )}
            {item.description && (
              <div className="pt-2 border-t">
                <p className="text-sm text-muted-foreground mb-1">Description</p>
                <p className="text-sm">{item.description}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {item.trackInventory && (
          <Card>
            <CardHeader>
              <CardTitle>Inventory Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Current Stock</span>
                <span className="font-mono font-medium">
                  {item.stockLevel} {item.unit || 'units'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Reorder Point</span>
                <span className="font-mono">
                  {item.reorderPoint ?? '-'} {item.reorderPoint ? (item.unit || 'units') : ''}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Reorder Quantity</span>
                <span className="font-mono">
                  {item.reorderQuantity ?? '-'} {item.reorderQuantity ? (item.unit || 'units') : ''}
                </span>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Accounting</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Income Account</span>
              <span>
                {item.incomeAccount
                  ? `${item.incomeAccount.code} - ${item.incomeAccount.name}`
                  : '-'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Expense Account</span>
              <span>
                {item.expenseAccount
                  ? `${item.expenseAccount.code} - ${item.expenseAccount.name}`
                  : '-'}
              </span>
            </div>
            {item.trackInventory && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Inventory Account</span>
                <span>
                  {item.inventoryAccount
                    ? `${item.inventoryAccount.code} - ${item.inventoryAccount.name}`
                    : '-'}
                </span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
