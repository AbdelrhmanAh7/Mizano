'use client';

import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Trash2 } from 'lucide-react';
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
  useDeliveryChallan,
  useDeleteDeliveryChallan,
  useIssueChallan,
  useMarkChallanReturned,
  getChallanStatusLabel,
  getChallanStatusColor,
  getChallanTypeLabel,
  canIssueChallan,
  canMarkReturned,
  canDeleteChallan,
  formatDate,
} from '@/lib/hooks/use-delivery-challans';

interface ChallanDetailPageProps {
  params: { id: string };
}

export default function ChallanDetailPage({ params }: ChallanDetailPageProps) {
  const { id } = params;
  const t = useTranslations('sales');
  const router = useRouter();
  const { data: challan, isLoading } = useDeliveryChallan(id);
  const deleteChallan = useDeleteDeliveryChallan();
  const issueChallan = useIssueChallan();
  const markReturned = useMarkChallanReturned();

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (!challan) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">{t('deliveryChallans.challanNotFound')}</p>
        <Button asChild className="mt-4">
          <Link href="/sales/delivery-challans">{t('deliveryChallans.backToChallans')}</Link>
        </Button>
      </div>
    );
  }

  const handleDelete = async () => {
    await deleteChallan.mutateAsync(challan.id);
    router.push('/sales/delivery-challans');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild aria-label={t('goBack')}>
            <Link href="/sales/delivery-challans">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight">{challan.challanNumber}</h1>
              <Badge variant="outline" className={getChallanStatusColor(challan.status)}>
                {getChallanStatusLabel(challan.status)}
              </Badge>
            </div>
            <p className="text-muted-foreground">
              {getChallanTypeLabel(challan.challanType)} - {challan.customer?.name}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {canIssueChallan(challan) && (
            <Button onClick={() => issueChallan.mutate(challan.id)}>
              {t('deliveryChallans.issueChallan')}
            </Button>
          )}
          {canMarkReturned(challan) && (
            <Button variant="outline" onClick={() => markReturned.mutate(challan.id)}>
              {t('deliveryChallans.markReturned')}
            </Button>
          )}
          {canDeleteChallan(challan) && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" className="text-red-600">
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t('deliveryChallans.deleteChallan')}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {t('deliveryChallans.deleteConfirmation')}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">{t('deliveryChallans.customer')}</p>
            <p className="text-lg font-medium">{challan.customer?.name || '-'}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">{t('deliveryChallans.date')}</p>
            <p className="text-lg font-medium">{formatDate(challan.date)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">{t('deliveryChallans.type')}</p>
            <p className="text-lg font-medium">{getChallanTypeLabel(challan.challanType)}</p>
          </CardContent>
        </Card>
      </div>

      {challan.invoice && (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">{t('deliveryChallans.linkedInvoice')}</p>
            <p className="font-medium">{challan.invoice.invoiceNumber}</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t('deliveryChallans.lineItems')}</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('deliveryChallans.table.item')}</TableHead>
                <TableHead>{t('deliveryChallans.table.sku')}</TableHead>
                <TableHead>{t('deliveryChallans.table.warehouse')}</TableHead>
                <TableHead className="text-right">{t('deliveryChallans.table.quantity')}</TableHead>
                <TableHead>{t('deliveryChallans.table.description')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {challan.lines.map((line, index) => (
                <TableRow key={line.id || index}>
                  <TableCell className="font-medium">{line.item?.name || '-'}</TableCell>
                  <TableCell className="font-mono text-sm">{line.item?.sku || '-'}</TableCell>
                  <TableCell>{line.warehouse?.name || '-'}</TableCell>
                  <TableCell className="text-right font-mono">{line.quantity}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {line.description || '-'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {challan.notes && (
        <Card>
          <CardHeader>
            <CardTitle>{t('deliveryChallans.notes')}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm">{challan.notes}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
