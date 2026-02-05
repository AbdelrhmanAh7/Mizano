'use client';

import { use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { ArrowLeft, CheckCircle, ArrowUp, ArrowDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import {
  useAdjustment,
  usePostAdjustment,
  getAdjustmentStatusLabel,
  getAdjustmentStatusColor,
  getReasonLabel,
} from '@/lib/hooks/use-adjustments';

interface AdjustmentDetailPageProps {
  params: Promise<{ id: string }>;
}

export default function AdjustmentDetailPage({ params }: AdjustmentDetailPageProps) {
  const { id } = use(params);
  const router = useRouter();
  const { data: adjustment, isLoading } = useAdjustment(id);
  const postAdjustment = usePostAdjustment();

  const handlePost = async () => {
    await postAdjustment.mutateAsync(id);
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

  if (!adjustment) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Adjustment not found</p>
        <Button asChild className="mt-4">
          <Link href="/inventory/adjustments">Back to Adjustments</Link>
        </Button>
      </div>
    );
  }

  const totalQty = adjustment.lines?.reduce(
    (sum: number, line: any) => sum + (line.quantityAdjusted || 0),
    0
  ) || 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/inventory/adjustments">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight">
                {adjustment.adjustmentNumber}
              </h1>
              <Badge
                variant="outline"
                className={getAdjustmentStatusColor(adjustment.status)}
              >
                {getAdjustmentStatusLabel(adjustment.status)}
              </Badge>
            </div>
            <p className="text-muted-foreground">
              {format(new Date(adjustment.date), 'MMMM d, yyyy')}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {adjustment.status === 'DRAFT' && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button>
                  <CheckCircle className="mr-2 h-4 w-4" />
                  Post Adjustment
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Post Adjustment</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will update the stock levels for all items in this adjustment.
                    This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handlePost}>
                    Post Adjustment
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div
                className={cn(
                  'p-2 rounded-lg',
                  adjustment.type === 'INCREASE' ? 'bg-green-100' : 'bg-red-100'
                )}
              >
                {adjustment.type === 'INCREASE' ? (
                  <ArrowUp className="h-5 w-5 text-green-600" />
                ) : (
                  <ArrowDown className="h-5 w-5 text-red-600" />
                )}
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Type</p>
                <p
                  className={cn(
                    'text-lg font-semibold',
                    adjustment.type === 'INCREASE' ? 'text-green-600' : 'text-red-600'
                  )}
                >
                  {adjustment.type === 'INCREASE' ? 'Increase Stock' : 'Decrease Stock'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Reason</p>
            <p className="text-lg font-semibold">{getReasonLabel(adjustment.reason)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Items Adjusted</p>
            <p className="text-2xl font-bold">{adjustment.lines?.length || 0}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Total Quantity</p>
            <p
              className={cn(
                'text-2xl font-bold font-mono',
                adjustment.type === 'INCREASE' ? 'text-green-600' : 'text-red-600'
              )}
            >
              {adjustment.type === 'INCREASE' ? '+' : '-'}
              {totalQty}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Details */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Adjustment Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Adjustment Number</span>
              <span className="font-mono">{adjustment.adjustmentNumber}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Date</span>
              <span>{format(new Date(adjustment.date), 'MMM d, yyyy')}</span>
            </div>
            {adjustment.reference && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Reference</span>
                <span>{adjustment.reference}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-muted-foreground">Status</span>
              <Badge
                variant="outline"
                className={getAdjustmentStatusColor(adjustment.status)}
              >
                {getAdjustmentStatusLabel(adjustment.status)}
              </Badge>
            </div>
          </CardContent>
        </Card>

        {adjustment.description && (
          <Card>
            <CardHeader>
              <CardTitle>Description</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm">{adjustment.description}</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Line Items */}
      <Card>
        <CardHeader>
          <CardTitle>Adjusted Items</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead>Warehouse</TableHead>
                <TableHead className="text-right">Quantity Adjusted</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {adjustment.lines?.map((line: any) => (
                <TableRow key={line.id}>
                  <TableCell className="font-medium">
                    {line.item?.name || '-'}
                  </TableCell>
                  <TableCell className="font-mono text-sm">
                    {line.item?.sku || '-'}
                  </TableCell>
                  <TableCell>{line.warehouse?.name || '-'}</TableCell>
                  <TableCell className="text-right">
                    <span
                      className={cn(
                        'font-mono font-medium',
                        adjustment.type === 'INCREASE'
                          ? 'text-green-600'
                          : 'text-red-600'
                      )}
                    >
                      {adjustment.type === 'INCREASE' ? '+' : '-'}
                      {line.quantityAdjusted}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
