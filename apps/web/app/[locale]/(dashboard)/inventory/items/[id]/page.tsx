'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  ArrowLeft,
  Pencil,
  Trash2,
  Package,
  DollarSign,
  TrendingUp,
  AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { useMoneyFormatter } from '@/lib/hooks/use-money-formatter';
import {
  useItem,
  useDeleteItem,
  useItemTypeLabel,
  getItemTypeColor,
  getStockStatus,
} from '@/lib/hooks/use-items';

interface ItemDetailPageProps {
  params: { id: string };
}

export default function ItemDetailPage({ params }: ItemDetailPageProps) {
  const t = useTranslations('inventory');
  const { id } = params;
  const router = useRouter();
  const { data: item, isLoading } = useItem(id);
  const deleteItem = useDeleteItem();
  const formatMoney = useMoneyFormatter();
  const typeLabel = useItemTypeLabel();

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
        <p className="text-muted-foreground">
          {t('items.title')} {t('common.notFound')}
        </p>
        <Button asChild className="mt-4">
          <Link href="/inventory/items">
            {t('common.backTo')} {t('items.title')}
          </Link>
        </Button>
      </div>
    );
  }

  const stockStatus = getStockStatus(item);
  const unitKey = `items.form.units.${item.unit || 'pcs'}`;
  const unitLabel = t.has(unitKey) ? t(unitKey) : item.unit || '';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/inventory/items">
              <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight">{item.name}</h1>
              <span
                className={cn(
                  'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
                  getItemTypeColor(item.type),
                )}
              >
                {typeLabel(item.type)}
              </span>
            </div>
            {item.sku && <p className="text-muted-foreground font-mono">SKU: {item.sku}</p>}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" asChild>
            <Link href={`/inventory/items/${id}/edit`}>
              <Pencil className="mr-2 h-4 w-4" />
              {t('common.edit')}
            </Link>
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" className="text-destructive">
                <Trash2 className="mr-2 h-4 w-4" />
                {t('common.delete')}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t('items.deleteItem')}</AlertDialogTitle>
                <AlertDialogDescription>{t('common.confirmDelete')}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDelete}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {t('common.delete')}
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
              <div className="p-2 bg-success/10 rounded-lg">
                <DollarSign className="h-5 w-5 text-success" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t('items.table.sellingPrice')}</p>
                <p className="text-2xl font-bold font-mono">{formatMoney(item.sellingPrice)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-info/10 rounded-lg">
                <TrendingUp className="h-5 w-5 text-info" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t('items.table.costPrice')}</p>
                <p className="text-2xl font-bold font-mono">{formatMoney(item.costPrice)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Package className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t('items.table.stock')}</p>
                {item.trackInventory ? (
                  <p className={cn('text-2xl font-bold font-mono', stockStatus.color)}>
                    {item.currentStock} {unitLabel}
                  </p>
                ) : (
                  <p className="text-2xl font-bold text-muted-foreground">
                    {t('items.stockStatus.notTracked')}
                  </p>
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
                    ? 'bg-success/10'
                    : stockStatus.status === 'low'
                      ? 'bg-warning/10'
                      : 'bg-destructive/10',
                )}
              >
                {stockStatus.status !== 'ok' ? (
                  <AlertTriangle
                    className={cn(
                      'h-5 w-5',
                      stockStatus.status === 'low' ? 'text-warning' : 'text-destructive',
                    )}
                  />
                ) : (
                  <Package className="h-5 w-5 text-success" />
                )}
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t('items.table.status')}</p>
                <p className={cn('text-lg font-semibold', stockStatus.color)}>
                  {item.trackInventory
                    ? t(`items.stockStatus.${stockStatus.status}`)
                    : t('items.stockStatus.notTracked')}
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
            <CardTitle>{t('items.itemDetails')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('items.form.type')}</span>
              <span
                className={cn(
                  'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                  getItemTypeColor(item.type),
                )}
              >
                {typeLabel(item.type)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('items.form.unit')}</span>
              <span>{item.unit ? unitLabel : '-'}</span>
            </div>
            {item.taxRate && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('items.detail.taxRate')}</span>
                <span>{item.taxRate}%</span>
              </div>
            )}
            {item.description && (
              <div className="pt-2 border-t">
                <p className="text-sm text-muted-foreground mb-1">{t('items.form.description')}</p>
                <p className="text-sm">{item.description}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {item.trackInventory && (
          <Card>
            <CardHeader>
              <CardTitle>{t('items.detail.inventorySettings')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('items.detail.currentStock')}</span>
                <span className="font-mono font-medium">
                  {item.currentStock} {unitLabel}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('items.form.reorderPoint')}</span>
                <span className="font-mono">
                  {item.reorderPoint ?? '-'} {item.reorderPoint ? unitLabel : ''}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('items.detail.reorderLevel')}</span>
                <span className="font-mono">
                  {item.reorderLevel ?? '-'} {item.reorderLevel ? unitLabel : ''}
                </span>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>{t('items.form.accounting')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('items.form.salesAccount')}</span>
              <span>
                {item.salesAccount ? `${item.salesAccount.code} - ${item.salesAccount.name}` : '-'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('items.form.purchaseAccount')}</span>
              <span>
                {item.purchaseAccount
                  ? `${item.purchaseAccount.code} - ${item.purchaseAccount.name}`
                  : '-'}
              </span>
            </div>
            {item.trackInventory && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('items.form.inventoryAccount')}</span>
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
