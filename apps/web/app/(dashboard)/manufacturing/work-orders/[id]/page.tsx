'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import {
  ArrowLeft,
  Play,
  CheckCircle2,
  XCircle,
  Package,
  AlertTriangle,
  Factory,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
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
import { Progress } from '@/components/ui/progress';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  useWorkOrder,
  useStartWorkOrder,
  useCompleteWorkOrder,
  useCancelWorkOrder,
  getWorkOrderStatusLabel,
  getWorkOrderStatusColor,
} from '@/lib/hooks/use-manufacturing';

export default function WorkOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [showCompleteDialog, setShowCompleteDialog] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [producedQuantity, setProducedQuantity] = useState<number>(0);

  const { data: workOrder, isLoading } = useWorkOrder(id);
  const startWorkOrder = useStartWorkOrder();
  const completeWorkOrder = useCompleteWorkOrder();
  const cancelWorkOrder = useCancelWorkOrder();

  const handleStart = async () => {
    await startWorkOrder.mutateAsync(id);
  };

  const handleComplete = async () => {
    await completeWorkOrder.mutateAsync({ id, producedQuantity });
    setShowCompleteDialog(false);
  };

  const handleCancel = async () => {
    await cancelWorkOrder.mutateAsync(id);
    setShowCancelDialog(false);
    router.push('/manufacturing/work-orders');
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-64" />
        <div className="grid grid-cols-4 gap-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (!workOrder) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-semibold">Work order not found</h2>
        <Button asChild className="mt-4">
          <Link href="/manufacturing/work-orders">Back to Work Orders</Link>
        </Button>
      </div>
    );
  }

  const progress = workOrder.completedQuantity
    ? (workOrder.completedQuantity / workOrder.quantity) * 100
    : 0;

  const components = workOrder.bom?.components || [];
  const requirements = components.map((c: any) => ({
    itemId: c.itemId,
    itemName: c.itemName || c.item?.name,
    itemCode: c.itemCode || c.item?.code,
    required: c.quantity * workOrder.quantity,
    unit: c.unit || c.item?.unit || 'pc',
  }));

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
              <h1 className="text-3xl font-bold tracking-tight">
                {workOrder.workOrderNumber}
              </h1>
              <Badge
                variant="outline"
                className={getWorkOrderStatusColor(workOrder.status)}
              >
                {getWorkOrderStatusLabel(workOrder.status)}
              </Badge>
            </div>
            <p className="text-muted-foreground">
              Created {format(new Date(workOrder.createdAt), 'MMMM d, yyyy')}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {workOrder.status === 'DRAFT' && (
            <>
              <Button onClick={handleStart} disabled={startWorkOrder.isPending}>
                <Play className="mr-2 h-4 w-4" />
                {startWorkOrder.isPending ? 'Starting...' : 'Start Production'}
              </Button>
              <Button
                variant="destructive"
                onClick={() => setShowCancelDialog(true)}
              >
                <XCircle className="mr-2 h-4 w-4" />
                Cancel
              </Button>
            </>
          )}
          {workOrder.status === 'IN_PROCESS' && (
            <>
              <Button onClick={() => {
                setProducedQuantity(workOrder.quantity - (workOrder.completedQuantity || 0));
                setShowCompleteDialog(true);
              }}>
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Record Production
              </Button>
              <Button
                variant="destructive"
                onClick={() => setShowCancelDialog(true)}
              >
                <XCircle className="mr-2 h-4 w-4" />
                Cancel
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Package className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Output Item</p>
                <p className="font-medium">
                  {workOrder.outputItem?.code}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Target Quantity</p>
            <p className="text-2xl font-bold">{workOrder.quantity}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Completed</p>
            <p className="text-2xl font-bold text-green-600">
              {workOrder.completedQuantity || 0}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Progress</p>
            <div className="mt-2">
              <Progress value={progress} className="h-3" />
              <p className="text-sm mt-1">{progress.toFixed(0)}%</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Details */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Work Order Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">BOM</p>
                <Link
                  href={`/manufacturing/bom/${workOrder.bomId}`}
                  className="font-medium text-blue-600 hover:underline"
                >
                  {workOrder.bom?.name}
                </Link>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Output Item</p>
                <p className="font-medium">
                  {workOrder.outputItem?.code} - {workOrder.outputItem?.name}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Start Date</p>
                <p className="font-medium">
                  {format(new Date(workOrder.startDate), 'MMM d, yyyy')}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Due Date</p>
                <p className="font-medium">
                  {workOrder.dueDate
                    ? format(new Date(workOrder.dueDate), 'MMM d, yyyy')
                    : '-'}
                </p>
              </div>
              {workOrder.completedAt && (
                <div>
                  <p className="text-sm text-muted-foreground">Completed At</p>
                  <p className="font-medium">
                    {format(new Date(workOrder.completedAt), 'MMM d, yyyy HH:mm')}
                  </p>
                </div>
              )}
            </div>
            {workOrder.notes && (
              <div>
                <p className="text-sm text-muted-foreground">Notes</p>
                <p className="mt-1">{workOrder.notes}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Stock Alerts */}
        {workOrder.stockAlerts && workOrder.stockAlerts.length > 0 && (
          <Card className="border-yellow-200 bg-yellow-50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-yellow-800">
                <AlertTriangle className="h-5 w-5" />
                Stock Alerts
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {workOrder.stockAlerts.map((alert: any, index: number) => (
                  <li key={index} className="text-sm text-yellow-800">
                    {alert.itemName}: Need {alert.required}, have {alert.available} (short by {alert.shortage})
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Material Requirements */}
      <Card>
        <CardHeader>
          <CardTitle>Material Requirements</CardTitle>
          <CardDescription>
            Materials needed to complete this work order
          </CardDescription>
        </CardHeader>
        <CardContent>
          {requirements.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No material requirements
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item Code</TableHead>
                  <TableHead>Item Name</TableHead>
                  <TableHead className="text-right">Required Quantity</TableHead>
                  <TableHead>Unit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {requirements.map((req: any, index: number) => (
                  <TableRow key={index}>
                    <TableCell className="font-mono">{req.itemCode}</TableCell>
                    <TableCell>{req.itemName}</TableCell>
                    <TableCell className="text-right font-mono">
                      {req.required}
                    </TableCell>
                    <TableCell>{req.unit}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Complete Dialog */}
      <AlertDialog open={showCompleteDialog} onOpenChange={setShowCompleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Record Production</AlertDialogTitle>
            <AlertDialogDescription>
              Enter the quantity produced. This will update inventory and create
              accounting entries.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <Label htmlFor="producedQuantity">Quantity Produced</Label>
            <Input
              id="producedQuantity"
              type="number"
              min="1"
              max={workOrder.quantity - (workOrder.completedQuantity || 0)}
              value={producedQuantity}
              onChange={(e) => setProducedQuantity(parseInt(e.target.value) || 0)}
              className="mt-2"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Remaining: {workOrder.quantity - (workOrder.completedQuantity || 0)}
            </p>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleComplete}
              disabled={completeWorkOrder.isPending || producedQuantity <= 0}
            >
              {completeWorkOrder.isPending ? 'Recording...' : 'Record Production'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Cancel Dialog */}
      <AlertDialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Work Order</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to cancel this work order? This action cannot
              be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Order</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCancel}
              className="bg-red-600 hover:bg-red-700"
              disabled={cancelWorkOrder.isPending}
            >
              {cancelWorkOrder.isPending ? 'Cancelling...' : 'Cancel Work Order'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
