'use client';

import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { ArrowLeft, Trash2, Building2, CreditCard, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { Badge } from '@/components/ui/badge';
import {
  usePaymentMade,
  useDeletePaymentMade,
  formatPaymentMode,
  formatCurrency,
} from '@/lib/hooks/use-payments-made';

interface PaymentDetailPageProps {
  params: { id: string };
}

export default function PaymentDetailPage({ params }: PaymentDetailPageProps) {
  const { id } = params;
  const t = useTranslations('purchases');
  const tCommon = useTranslations('common');
  const router = useRouter();
  const { data: payment, isLoading } = usePaymentMade(id);
  const deletePayment = useDeletePaymentMade();

  const currency = payment?.vendor?.currency || 'USD';

  const handleDelete = async () => {
    await deletePayment.mutateAsync(id);
    router.push('/purchases/payments');
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

  if (!payment) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">{t('payments.paymentNotFound')}</p>
        <Button asChild className="mt-4">
          <Link href="/purchases/payments">{t('payments.backToPayments')}</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild aria-label={t('goBack')}>
            <Link href="/purchases/payments">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight font-mono">
                {payment.paymentNumber}
              </h1>
              <Badge variant="outline">{formatPaymentMode(payment.paymentMode)}</Badge>
            </div>
            <p className="text-muted-foreground">
              {t('payments.paymentTo', { name: payment.vendor?.name || '' })}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" className="text-red-600">
                <Trash2 className="mr-2 h-4 w-4" />
                {tCommon('buttons.delete')}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t('payments.deleteTitle')}</AlertDialogTitle>
                <AlertDialogDescription>{t('payments.deleteConfirmation')}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{tCommon('buttons.cancel')}</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
                  {tCommon('buttons.delete')}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <CreditCard className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t('payments.amount')}</p>
                <p className="text-2xl font-bold font-mono">
                  {formatCurrency(payment.amount, currency)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <Calendar className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t('payments.paymentDate')}</p>
                <p className="text-2xl font-bold">
                  {format(new Date(payment.date), 'MMM d, yyyy')}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 rounded-lg">
                <Building2 className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t('payments.paidFrom')}</p>
                <p className="text-lg font-semibold">{payment.paidFromAccount?.name || '-'}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Payment Details */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>{t('payments.paymentDetails')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('payments.vendor')}</span>
              <Link
                href={`/purchases/vendors/${payment.vendorId}`}
                className="text-blue-600 hover:underline"
              >
                {payment.vendor?.name}
              </Link>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('payments.paymentMode')}</span>
              <span>{formatPaymentMode(payment.paymentMode)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('payments.reference')}</span>
              <span className="font-mono">{payment.reference || '-'}</span>
            </div>
            {payment.notes && (
              <div className="pt-2 border-t">
                <p className="text-sm text-muted-foreground mb-1">{t('payments.notes')}</p>
                <p className="text-sm">{payment.notes}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Bill Allocations */}
        <Card>
          <CardHeader>
            <CardTitle>{t('payments.billAllocations')}</CardTitle>
          </CardHeader>
          <CardContent>
            {payment.allocations && payment.allocations.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('payments.table.billNumber')}</TableHead>
                    <TableHead>{t('payments.table.date')}</TableHead>
                    <TableHead className="text-right">{t('payments.table.allocated')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payment.allocations.map((allocation) => (
                    <TableRow key={allocation.billId}>
                      <TableCell>
                        <Link
                          href={`/purchases/bills/${allocation.billId}`}
                          className="font-mono text-blue-600 hover:underline"
                        >
                          {allocation.bill?.billNumber || allocation.billId}
                        </Link>
                      </TableCell>
                      <TableCell>
                        {allocation.bill?.date
                          ? format(new Date(allocation.bill.date), 'MMM d, yyyy')
                          : '-'}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatCurrency(allocation.amount, currency)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">
                {t('payments.noBillAllocations')}
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
