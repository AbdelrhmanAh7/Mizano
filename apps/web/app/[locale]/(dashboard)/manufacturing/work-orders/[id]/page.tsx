'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Trash2,
  Play,
  CheckCircle,
  XCircle,
  Package,
  Layers,
  AlertTriangle,
  Calendar,
  ClipboardList,
  Plus,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import {
  useWorkOrder,
  useDeleteWorkOrder,
  useStartWorkOrder,
  useCompleteWorkOrder,
  useCancelWorkOrder,
  useRecordProduction,
  useProductionHistory,
  getWorkOrderStatusColor,
  getWorkOrderStatusLabel,
  type MaterialRequirement,
  type ProductionEntry,
} from '@/lib/hooks/use-manufacturing';
import { usePermissions } from '@/lib/hooks/use-permissions';
import { useTranslations } from 'next-intl';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

export default function WorkOrderDetailPage() {
  const t = useTranslations('manufacturing');
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const { hasPermission } = usePermissions();
  const workOrderId = params.id as string;

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [completeDialogOpen, setCompleteDialogOpen] = useState(false);
  const [recordDialogOpen, setRecordDialogOpen] = useState(false);
  const [producedQuantity, setProducedQuantity] = useState<number>(0);
  const [rejectedQuantity, setRejectedQuantity] = useState<number>(0);
  const [wastageQuantity, setWastageQuantity] = useState<number>(0);
  const [productionNotes, setProductionNotes] = useState('');
  const [productionDate, setProductionDate] = useState(new Date().toISOString().split('T')[0]);

  const { data: workOrder, isLoading } = useWorkOrder(workOrderId);
  const { data: historyData } = useProductionHistory(workOrderId);
  const deleteWorkOrder = useDeleteWorkOrder();
  const startWorkOrder = useStartWorkOrder();
  const completeWorkOrder = useCompleteWorkOrder();
  const cancelWorkOrder = useCancelWorkOrder();
  const recordProduction = useRecordProduction(workOrderId);

  const canEdit = hasPermission('manufacturing.edit');
  const canDelete = hasPermission('manufacturing.delete');

  const productionHistory: ProductionEntry[] = Array.isArray(historyData) ? historyData : [];

  const handleStart = async () => {
    try {
      await startWorkOrder.mutateAsync(workOrderId);
      toast({ title: t('workOrders.status.inProcess') });
    } catch (error: unknown) {
      toast({
        title: 'Error',
        description:
          (error as { response?: { data?: { message?: string } } }).response?.data?.message ||
          'Failed to start work order',
        variant: 'destructive',
      });
    }
  };

  const handleComplete = async () => {
    try {
      await completeWorkOrder.mutateAsync({ id: workOrderId, producedQuantity });
      toast({ title: t('workOrders.status.completed') });
      setCompleteDialogOpen(false);
    } catch (error: unknown) {
      toast({
        title: 'Error',
        description:
          (error as { response?: { data?: { message?: string } } }).response?.data?.message ||
          'Failed to complete work order',
        variant: 'destructive',
      });
    }
  };

  const handleRecordProduction = async () => {
    try {
      await recordProduction.mutateAsync({
        quantityProduced: producedQuantity,
        quantityRejected: rejectedQuantity || undefined,
        wastageQuantity: wastageQuantity || undefined,
        notes: productionNotes || undefined,
        date: productionDate,
      });
      toast({ title: 'Production entry recorded' });
      setRecordDialogOpen(false);
      setProducedQuantity(0);
      setRejectedQuantity(0);
      setWastageQuantity(0);
      setProductionNotes('');
    } catch (error: unknown) {
      toast({
        title: 'Error',
        description:
          (error as { response?: { data?: { message?: string } } }).response?.data?.message ||
          'Failed to record production',
        variant: 'destructive',
      });
    }
  };

  const handleCancel = async () => {
    try {
      await cancelWorkOrder.mutateAsync(workOrderId);
      toast({ title: t('workOrders.status.cancelled') });
      setCancelDialogOpen(false);
    } catch (error: unknown) {
      toast({
        title: 'Error',
        description:
          (error as { response?: { data?: { message?: string } } }).response?.data?.message ||
          'Failed to cancel work order',
        variant: 'destructive',
      });
    }
  };

  const confirmDelete = async () => {
    try {
      await deleteWorkOrder.mutateAsync(workOrderId);
      toast({ title: t('workOrders.deleteWorkOrder') });
      router.push('/manufacturing/work-orders');
    } catch (error: unknown) {
      toast({
        title: 'Error',
        description:
          (error as { response?: { data?: { message?: string } } }).response?.data?.message ||
          'Failed to delete work order',
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
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-[300px]" />
      </div>
    );
  }

  if (!workOrder) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/manufacturing/work-orders">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <h1 className="text-3xl font-bold tracking-tight">Work Order Not Found</h1>
        </div>
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">
              The work order you&apos;re looking for doesn&apos;t exist.
            </p>
            <Button asChild className="mt-4">
              <Link href="/manufacturing/work-orders">Back to Work Orders</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isDraft = workOrder.status === 'DRAFT';
  const isInProcess = workOrder.status === 'IN_PROCESS';
  const isCompleted = workOrder.status === 'COMPLETED';
  const materialRequirements = workOrder.materialRequirements || [];
  const stockAlerts = workOrder.stockAlerts || [];
  const hasShortages = stockAlerts.length > 0;

  const plannedEnd = workOrder.plannedEndDate || workOrder.dueDate;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/manufacturing/work-orders">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight">{workOrder.workOrderNumber}</h1>
              <Badge className={getWorkOrderStatusColor(workOrder.status)}>
                {getWorkOrderStatusLabel(workOrder.status)}
              </Badge>
            </div>
            {workOrder.bom && (
              <Link
                href={`/manufacturing/bom/${workOrder.bom.id}`}
                className="text-muted-foreground hover:underline"
              >
                BOM: {workOrder.bom.name}
              </Link>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {canEdit && isDraft && (
            <Button onClick={handleStart} disabled={startWorkOrder.isPending}>
              <Play className="mr-2 h-4 w-4" />
              {startWorkOrder.isPending ? 'Starting...' : 'Start Production'}
            </Button>
          )}
          {canEdit && isInProcess && (
            <>
              <Button
                variant="outline"
                onClick={() => {
                  setProducedQuantity(1);
                  setProductionDate(new Date().toISOString().split('T')[0]);
                  setRecordDialogOpen(true);
                }}
              >
                <Plus className="mr-2 h-4 w-4" />
                {t('workOrders.recordProduction')}
              </Button>
              <Button
                onClick={() => {
                  setProducedQuantity(workOrder.quantity);
                  setCompleteDialogOpen(true);
                }}
              >
                <CheckCircle className="mr-2 h-4 w-4" />
                Complete
              </Button>
            </>
          )}
          {canEdit && (isDraft || isInProcess) && (
            <Button
              variant="outline"
              onClick={() => setCancelDialogOpen(true)}
              className="text-orange-600 hover:text-orange-700"
            >
              <XCircle className="mr-2 h-4 w-4" />
              Cancel
            </Button>
          )}
          {canDelete && isDraft && (
            <Button variant="destructive" onClick={() => setDeleteDialogOpen(true)}>
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </Button>
          )}
        </div>
      </div>

      {/* Stock Shortage Warning */}
      {hasShortages && !isCompleted && (
        <Card className="border-orange-200 bg-orange-50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-orange-700">
              <AlertTriangle className="h-5 w-5" />
              <span className="font-medium">
                Material shortages detected for {stockAlerts.length} item(s)
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <Package className="h-4 w-4" />
              Output Item
            </div>
            <div className="text-lg font-bold">{workOrder.outputItem?.name || '-'}</div>
            <div className="text-xs text-muted-foreground">{workOrder.outputItem?.code}</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <Layers className="h-4 w-4" />
              Quantity to Produce
            </div>
            <div className="text-2xl font-bold">{workOrder.quantity}</div>
            {workOrder.completedQuantity !== undefined && workOrder.completedQuantity > 0 && (
              <div className="text-xs text-green-600">{workOrder.completedQuantity} completed</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <Calendar className="h-4 w-4" />
              Start Date
            </div>
            <div className="text-lg font-bold">
              {workOrder.plannedStartDate
                ? format(new Date(workOrder.plannedStartDate), 'MMM d, yyyy')
                : workOrder.startDate
                  ? format(new Date(workOrder.startDate), 'MMM d, yyyy')
                  : 'Not set'}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <Calendar className="h-4 w-4" />
              End Date
            </div>
            <div className="text-lg font-bold">
              {plannedEnd ? format(new Date(plannedEnd), 'MMM d, yyyy') : 'Not set'}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Material Requirements */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Layers className="h-5 w-5" />
            Material Requirements
          </CardTitle>
        </CardHeader>
        <CardContent>
          {materialRequirements.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item Code</TableHead>
                  <TableHead>Item Name</TableHead>
                  <TableHead className="text-right">Required</TableHead>
                  <TableHead className="text-right">Available</TableHead>
                  <TableHead className="text-right">Shortage</TableHead>
                  <TableHead>Unit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {materialRequirements.map((req: MaterialRequirement) => (
                  <TableRow key={req.itemId}>
                    <TableCell className="font-mono text-sm">{req.itemCode}</TableCell>
                    <TableCell className="font-medium">{req.itemName}</TableCell>
                    <TableCell className="text-right font-mono">{req.required}</TableCell>
                    <TableCell className="text-right font-mono">{req.available}</TableCell>
                    <TableCell className="text-right font-mono">
                      <span className={cn(req.shortage > 0 && 'text-red-600 font-semibold')}>
                        {req.shortage > 0 ? `-${req.shortage}` : '0'}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{req.unit}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              No material requirements available
            </div>
          )}
        </CardContent>
      </Card>

      {/* Production History */}
      {(isInProcess || isCompleted) && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5" />
              Production History
            </CardTitle>
          </CardHeader>
          <CardContent>
            {productionHistory.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                {t('production.empty.title')}. {t('production.empty.description')}.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('production.table.date')}</TableHead>
                    <TableHead className="text-right">{t('production.table.produced')}</TableHead>
                    <TableHead className="text-right">{t('production.table.rejected')}</TableHead>
                    <TableHead className="text-right">{t('production.table.wastage')}</TableHead>
                    <TableHead>Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {productionHistory.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell>{format(new Date(entry.date), 'MMM d, yyyy')}</TableCell>
                      <TableCell className="text-right font-mono font-medium text-green-700">
                        {entry.quantityProduced}
                      </TableCell>
                      <TableCell className="text-right font-mono text-red-600">
                        {entry.quantityRejected || 0}
                      </TableCell>
                      <TableCell className="text-right font-mono text-orange-600">
                        {entry.wastageQuantity || 0}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {entry.notes || '-'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {/* Notes */}
      {workOrder.notes && (
        <Card>
          <CardHeader>
            <CardTitle>Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-sm">{workOrder.notes}</p>
          </CardContent>
        </Card>
      )}

      {/* Record Production Dialog */}
      <Dialog open={recordDialogOpen} onOpenChange={setRecordDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('workOrders.recordProduction')}</DialogTitle>
            <DialogDescription>Record a production entry for this work order.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('production.form.date')}</Label>
                <Input
                  type="date"
                  value={productionDate}
                  onChange={(e) => setProductionDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>{t('production.form.quantityProduced')}</Label>
                <Input
                  type="number"
                  min="1"
                  value={producedQuantity}
                  onChange={(e) => setProducedQuantity(Number(e.target.value))}
                />
              </div>
              <div className="space-y-2">
                <Label>{t('production.form.quantityRejected')}</Label>
                <Input
                  type="number"
                  min="0"
                  value={rejectedQuantity}
                  onChange={(e) => setRejectedQuantity(Number(e.target.value))}
                />
              </div>
              <div className="space-y-2">
                <Label>{t('production.form.wastageQuantity')}</Label>
                <Input
                  type="number"
                  min="0"
                  value={wastageQuantity}
                  onChange={(e) => setWastageQuantity(Number(e.target.value))}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t('production.form.notes')}</Label>
              <Textarea
                placeholder="Optional notes..."
                value={productionNotes}
                onChange={(e) => setProductionNotes(e.target.value)}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRecordDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => void handleRecordProduction()}
              disabled={recordProduction.isPending || producedQuantity <= 0}
            >
              {recordProduction.isPending ? 'Recording...' : 'Record Entry'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Complete Dialog */}
      <Dialog open={completeDialogOpen} onOpenChange={setCompleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Complete Work Order</DialogTitle>
            <DialogDescription>
              Enter the quantity produced to complete this work order. Raw materials will be
              consumed and finished goods will be added to inventory.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="producedQuantity">Quantity Produced</Label>
              <Input
                id="producedQuantity"
                type="number"
                min="1"
                max={workOrder.quantity}
                value={producedQuantity}
                onChange={(e) => setProducedQuantity(Number(e.target.value))}
              />
              <p className="text-xs text-muted-foreground">
                Planned quantity: {workOrder.quantity}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCompleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => void handleComplete()}
              disabled={completeWorkOrder.isPending || producedQuantity <= 0}
            >
              {completeWorkOrder.isPending ? 'Completing...' : 'Complete Production'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel Dialog */}
      <AlertDialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Work Order</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to cancel work order &quot;{workOrder.workOrderNumber}&quot;?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void handleCancel()}
              className="bg-orange-600 hover:bg-orange-700"
            >
              Cancel Work Order
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Work Order</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete work order &quot;{workOrder.workOrderNumber}&quot;?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void confirmDelete()}
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
