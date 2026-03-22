'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ArrowLeft, Edit, Trash2, Package, Layers, DollarSign, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
import { useToast } from '@/components/ui/use-toast';
import {
  useBOM,
  useDeleteBOM,
  getBOMStatusColor,
  getBOMStatusLabel,
  getWorkOrderStatusColor,
  getWorkOrderStatusLabel,
  formatCurrency,
  BOMComponent,
  useWorkOrdersByBom,
  type WorkOrderStatus,
} from '@/lib/hooks/use-manufacturing';
import { usePermissions } from '@/lib/hooks/use-permissions';
import { BOMForm } from '@/components/manufacturing/bom-form';

export default function BOMDetailPage() {
  const t = useTranslations('manufacturing');
  const tCommon = useTranslations('common');
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const { hasPermission } = usePermissions();
  const bomId = params.id as string;

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  const { data: bom, isLoading } = useBOM(bomId);
  const { data: workOrdersResponse } = useWorkOrdersByBom(bomId);
  // API returns { data: WorkOrder[], meta: {...} } — normalise to plain array
  const relatedWorkOrders = Array.isArray(workOrdersResponse?.data)
    ? workOrdersResponse.data
    : Array.isArray(workOrdersResponse)
      ? workOrdersResponse
      : [];
  const deleteBOM = useDeleteBOM();

  const canEdit = hasPermission('manufacturing.edit');
  const canDelete = hasPermission('manufacturing.delete');

  const confirmDelete = async () => {
    try {
      await deleteBOM.mutateAsync(bomId);
      toast({ title: t('bom.deleteBom') });
      router.push('/manufacturing/bom');
    } catch (error: unknown) {
      toast({
        title: tCommon('errors.generic'),
        description:
          (error as { response?: { data?: { message?: string } } }).response?.data?.message ||
          tCommon('errors.generic'),
        variant: 'destructive',
      });
    }
    setDeleteDialogOpen(false);
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10" />
          <Skeleton className="h-8 w-48" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
        <Skeleton className="h-[300px]" />
      </div>
    );
  }

  if (!bom) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/manufacturing/bom">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{t('bom.empty.title')}</h1>
          </div>
        </div>
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">{tCommon('errors.notFound')}</p>
            <Button asChild className="mt-4">
              <Link href="/manufacturing/bom">{tCommon('buttons.back')}</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isEditing) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => setIsEditing(false)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{t('bom.editBom')}</h1>
            <p className="text-muted-foreground">{bom.name}</p>
          </div>
        </div>
        <BOMForm bom={bom} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/manufacturing/bom">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight">{bom.name}</h1>
              <Badge className={getBOMStatusColor(bom.status)}>
                {getBOMStatusLabel(bom.status)}
              </Badge>
            </div>
            {bom.outputItem && (
              <p className="text-muted-foreground">
                {t('bom.produces', { code: bom.outputItem.code, name: bom.outputItem.name })}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {canEdit && (
            <Button variant="outline" onClick={() => setIsEditing(true)}>
              <Edit className="mr-2 h-4 w-4" />
              {tCommon('buttons.edit')}
            </Button>
          )}
          <Button asChild>
            <Link href={`/manufacturing/work-orders/new?bomId=${bom.id}`}>
              <Wrench className="mr-2 h-4 w-4" />
              {t('workOrders.newWorkOrder')}
            </Link>
          </Button>
          {canDelete && (
            <Button variant="destructive" onClick={() => setDeleteDialogOpen(true)}>
              <Trash2 className="mr-2 h-4 w-4" />
              {tCommon('buttons.delete')}
            </Button>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <Package className="h-4 w-4" />
              {t('bom.form.outputItem')}
            </div>
            <div className="text-lg font-bold">{bom.outputItem?.name || '-'}</div>
            <div className="text-xs text-muted-foreground">{bom.outputItem?.code}</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <Package className="h-4 w-4" />
              {t('bom.form.outputQuantity')}
            </div>
            <div className="text-2xl font-bold">{bom.outputQuantity}</div>
            <div className="text-xs text-muted-foreground">{t('bom.perProductionRun')}</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <Layers className="h-4 w-4" />
              {t('bom.form.items')}
            </div>
            <div className="text-2xl font-bold">{bom.components?.length || 0}</div>
            <div className="text-xs text-muted-foreground">{t('bom.rawMaterials')}</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <DollarSign className="h-4 w-4" />
              {t('bom.form.operationsCost')}
            </div>
            <div className="text-2xl font-bold font-mono">{formatCurrency(bom.operationsCost)}</div>
          </CardContent>
        </Card>
      </div>

      {/* Components Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Layers className="h-5 w-5" />
            {t('bom.components')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {bom.components && bom.components.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('bom.form.item')}</TableHead>
                  <TableHead>{tCommon('name')}</TableHead>
                  <TableHead className="text-right">{t('bom.form.quantity')}</TableHead>
                  <TableHead>{tCommon('unit')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bom.components.map((component: BOMComponent) => (
                  <TableRow key={component.id}>
                    <TableCell className="font-mono text-sm">{component.itemCode || '-'}</TableCell>
                    <TableCell className="font-medium">{component.itemName || '-'}</TableCell>
                    <TableCell className="text-right font-mono">{component.quantity}</TableCell>
                    <TableCell className="text-muted-foreground">{component.unit || '-'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-8 text-muted-foreground">{t('bom.noComponents')}</div>
          )}
        </CardContent>
      </Card>

      {/* Related Work Orders */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Wrench className="h-5 w-5" />
              {t('bom.relatedWorkOrders')}
            </CardTitle>
            <Button asChild size="sm">
              <Link href={`/manufacturing/work-orders/new?bomId=${bom.id}`}>
                <Wrench className="mr-2 h-4 w-4" />
                {t('workOrders.newWorkOrder')}
              </Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {!relatedWorkOrders || relatedWorkOrders.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Wrench className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <p>{t('bom.noWorkOrders')}</p>
              <Button asChild variant="outline" size="sm" className="mt-3">
                <Link href={`/manufacturing/work-orders/new?bomId=${bom.id}`}>
                  {t('bom.createWorkOrder')}
                </Link>
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('workOrders.table.workOrderNumber')}</TableHead>
                  <TableHead>{t('workOrders.table.quantity')}</TableHead>
                  <TableHead>{t('workOrders.table.plannedStart')}</TableHead>
                  <TableHead>{t('workOrders.table.status')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {relatedWorkOrders.map(
                  (wo: {
                    id: string;
                    workOrderNumber: string;
                    quantity: number;
                    plannedStartDate?: string;
                    status: WorkOrderStatus;
                  }) => (
                    <TableRow key={wo.id}>
                      <TableCell>
                        <Link
                          href={`/manufacturing/work-orders/${wo.id}`}
                          className="font-mono text-sm text-primary hover:underline"
                        >
                          {wo.workOrderNumber}
                        </Link>
                      </TableCell>
                      <TableCell>{wo.quantity}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {wo.plannedStartDate
                          ? new Date(wo.plannedStartDate).toLocaleDateString()
                          : '-'}
                      </TableCell>
                      <TableCell>
                        <Badge className={getWorkOrderStatusColor(wo.status)}>
                          {getWorkOrderStatusLabel(wo.status)}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ),
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('bom.deleteBom')}</AlertDialogTitle>
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
