'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { format } from 'date-fns';
import { ArrowLeft, CheckCircle, XCircle, Truck, ArrowRight } from 'lucide-react';
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
import {
  useTransfer,
  useCompleteTransfer,
  useCancelTransfer,
  getTransferStatusLabel,
  getTransferStatusColor,
} from '@/lib/hooks/use-transfers';

interface TransferDetailPageProps {
  params: { id: string };
}

export default function TransferDetailPage({ params }: TransferDetailPageProps) {
  const t = useTranslations('inventory');
  const { id } = params;
  const { data: transfer, isLoading } = useTransfer(id);
  const completeTransfer = useCompleteTransfer();
  const cancelTransfer = useCancelTransfer();

  const handleComplete = async () => {
    await completeTransfer.mutateAsync(id);
  };

  const handleCancel = async () => {
    await cancelTransfer.mutateAsync(id);
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

  if (!transfer) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">
          {t('transfers.title')} {t('common.notFound')}
        </p>
        <Button asChild className="mt-4">
          <Link href="/inventory/transfers">
            {t('common.backTo')} {t('transfers.title')}
          </Link>
        </Button>
      </div>
    );
  }

  const totalQty =
    transfer.lines?.reduce(
      (sum: number, line: { quantity?: number }) => sum + (line.quantity || 0),
      0,
    ) || 0;

  const canComplete = transfer.status === 'PENDING' || transfer.status === 'IN_TRANSIT';
  const canCancel = transfer.status === 'PENDING' || transfer.status === 'IN_TRANSIT';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/inventory/transfers">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight">{transfer.transferNumber}</h1>
              <Badge variant="outline" className={getTransferStatusColor(transfer.status)}>
                {getTransferStatusLabel(transfer.status)}
              </Badge>
            </div>
            <p className="text-muted-foreground">
              {format(new Date(transfer.date), 'MMMM d, yyyy')}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {canComplete && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button>
                  <CheckCircle className="mr-2 h-4 w-4" />
                  {t('transfers.completeTransfer')}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t('transfers.completeTransfer')}</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will finalize the transfer and update inventory levels in both warehouses.
                    This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                  <AlertDialogAction onClick={handleComplete}>
                    {t('transfers.completeTransfer')}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
          {canCancel && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" className="text-red-600">
                  <XCircle className="mr-2 h-4 w-4" />
                  {t('common.cancel')}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t('transfers.cancelTransfer')}</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to cancel this transfer? If items were already in transit,
                    no stock changes will be made.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                  <AlertDialogAction onClick={handleCancel} className="bg-red-600 hover:bg-red-700">
                    {t('transfers.cancelTransfer')}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>

      {/* Transfer Route */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-center gap-8">
            <div className="text-center">
              <div className="p-4 bg-blue-100 rounded-lg inline-block">
                <Truck className="h-8 w-8 text-blue-600" />
              </div>
              <p className="mt-2 font-semibold">{transfer.fromWarehouse?.name}</p>
              <p className="text-sm text-muted-foreground">Source</p>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <div className="w-20 h-0.5 bg-border"></div>
              <ArrowRight className="h-6 w-6" />
              <div className="w-20 h-0.5 bg-border"></div>
            </div>
            <div className="text-center">
              <div className="p-4 bg-green-100 rounded-lg inline-block">
                <Truck className="h-8 w-8 text-green-600" />
              </div>
              <p className="mt-2 font-semibold">{transfer.toWarehouse?.name}</p>
              <p className="text-sm text-muted-foreground">Destination</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Transfer Number</p>
            <p className="text-xl font-semibold font-mono">{transfer.transferNumber}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Items</p>
            <p className="text-2xl font-bold">{transfer.lines?.length || 0}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Total Quantity</p>
            <p className="text-2xl font-bold font-mono">{totalQty} units</p>
          </CardContent>
        </Card>
      </div>

      {/* Notes */}
      {transfer.notes && (
        <Card>
          <CardHeader>
            <CardTitle>Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm">{transfer.notes}</p>
          </CardContent>
        </Card>
      )}

      {/* Line Items */}
      <Card>
        <CardHeader>
          <CardTitle>{t('transfers.transferDetails')}</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead className="text-right">Quantity</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transfer.lines?.map(
                (line: {
                  id: string;
                  item?: { name?: string; sku?: string | null };
                  quantity: number;
                }) => (
                  <TableRow key={line.id}>
                    <TableCell className="font-medium">{line.item?.name || '-'}</TableCell>
                    <TableCell className="font-mono text-sm">{line.item?.sku || '-'}</TableCell>
                    <TableCell className="text-right font-mono font-medium">
                      {line.quantity}
                    </TableCell>
                  </TableRow>
                ),
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
