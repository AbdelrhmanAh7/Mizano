'use client';

import { format } from 'date-fns';
import { ArrowDown, ArrowLeft, ArrowUp, Undo2 } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  getAdjustmentStatusColor,
  getAdjustmentStatusLabel,
  getReasonLabel,
  useAdjustment,
  useVoidAdjustment,
} from '@/lib/hooks/use-adjustments';
import { usePermissions } from '@/lib/hooks/use-permissions';
import { cn } from '@/lib/utils';

interface AdjustmentDetailPageProps {
  params: { id: string };
}

export default function AdjustmentDetailPage({ params }: AdjustmentDetailPageProps): JSX.Element {
  const t = useTranslations('inventory');
  const { id } = params;
  const { hasPermission } = usePermissions();
  const { data: adjustment, isLoading, isError } = useAdjustment(id);
  const voidAdjustment = useVoidAdjustment();

  const handleVoid = async (): Promise<void> => {
    try {
      await voidAdjustment.mutateAsync(id);
    } catch {
      // The mutation toast shows the API error
    }
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
      </div>
    );
  }

  if (isError || !adjustment) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">
          {isError
            ? t('adjustments.loadError')
            : `${t('adjustments.title')} ${t('common.notFound')}`}
        </p>
        <Button asChild className="mt-4">
          <Link href="/inventory/adjustments">
            {t('common.backTo')} {t('adjustments.title')}
          </Link>
        </Button>
      </div>
    );
  }

  const increase = adjustment.type === 'INCREASE';
  const tone = increase ? 'text-green-600' : 'text-red-600';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/inventory/adjustments">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight">{adjustment.adjustmentNumber}</h1>
              <Badge variant="outline" className={getAdjustmentStatusColor(adjustment.status)}>
                {getAdjustmentStatusLabel(adjustment.status)}
              </Badge>
            </div>
            <p className="text-muted-foreground">
              {format(new Date(adjustment.date), 'MMMM d, yyyy')}
            </p>
          </div>
        </div>

        {adjustment.status === 'POSTED' && hasPermission('inventory.delete') && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" disabled={voidAdjustment.isPending}>
                <Undo2 className="mr-2 h-4 w-4" />
                {t('adjustments.void.action')}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t('adjustments.void.title')}</AlertDialogTitle>
                <AlertDialogDescription>{t('adjustments.void.description')}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                <AlertDialogAction onClick={() => void handleVoid()}>
                  {t('adjustments.void.action')}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              {increase ? (
                <ArrowUp className="h-5 w-5 text-green-600" />
              ) : (
                <ArrowDown className="h-5 w-5 text-red-600" />
              )}
              <div>
                <p className="text-sm text-muted-foreground">{t('adjustments.table.type')}</p>
                <p className={cn('text-lg font-semibold', tone)}>
                  {increase ? t('adjustments.types.increase') : t('adjustments.types.decrease')}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">{t('adjustments.table.reason')}</p>
            <p className="text-lg font-semibold">{getReasonLabel(adjustment.reason)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">{t('adjustments.table.quantity')}</p>
            <p className={cn('text-2xl font-bold font-mono', tone)}>
              {increase ? '+' : '-'}
              {adjustment.quantity}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">{t('adjustments.value')}</p>
            <p className="text-2xl font-bold font-mono">{adjustment.value ?? '-'}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('adjustments.adjustmentDetails')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t('adjustments.table.item')}</span>
            <span>
              {adjustment.item.name}
              {adjustment.item.sku ? ` (${adjustment.item.sku})` : ''}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t('adjustments.table.warehouse')}</span>
            <span>{adjustment.warehouse.name}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t('adjustments.form.account')}</span>
            <span>
              {adjustment.account.code} - {adjustment.account.name}
            </span>
          </div>
          {adjustment.journalNumber && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('adjustments.journal')}</span>
              <span className="font-mono">{adjustment.journalNumber}</span>
            </div>
          )}
          {adjustment.notes && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('adjustments.form.notes')}</span>
              <span>{adjustment.notes}</span>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
