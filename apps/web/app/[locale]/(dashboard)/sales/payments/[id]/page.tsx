'use client';

import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { ArrowLeft, User, Calendar, CreditCard, DollarSign, Building, Ban } from 'lucide-react';
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
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  usePaymentReceived,
  useVoidPaymentReceived,
  getPaymentModeLabel,
} from '@/lib/hooks/use-payments-received';
import { PaymentModeBadge } from '@/components/sales/status-badge';
import { format } from 'date-fns';
import { usePermissions } from '@/lib/hooks/use-permissions';

export default function PaymentReceivedDetailPage() {
  const params = useParams();
  const t = useTranslations('sales');
  const tCommon = useTranslations('common');
  const paymentId = params.id as string;

  const { data: payment, isLoading } = usePaymentReceived(paymentId);
  const voidPayment = useVoidPaymentReceived();
  const { hasPermission } = usePermissions();
  const canVoid = hasPermission('sales.delete');

  const formatCurrency = (amount: string | number, currency: string = 'USD') => {
    const num = typeof amount === 'string' ? parseFloat(amount) : amount;
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
    }).format(num);
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

  if (!payment) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild aria-label={t('goBack')}>
            <Link href="/sales/payments">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{t('payments.paymentNotFound')}</h1>
          </div>
        </div>
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">{t('payments.notFoundMessage')}</p>
            <Button asChild className="mt-4">
              <Link href="/sales/payments">{t('payments.backToPayments')}</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild aria-label={t('goBack')}>
            <Link href="/sales/payments">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight">{payment.paymentNumber}</h1>
              <PaymentModeBadge mode={payment.paymentMode} />
              {payment.deletedAt && (
                <Badge variant="destructive">{t('payments.voidedBadge')}</Badge>
              )}
            </div>
            {payment.customer && (
              <Link
                href={`/sales/customers/${payment.customer.id}`}
                className="text-muted-foreground hover:underline"
              >
                {payment.customer.name}
              </Link>
            )}
          </div>
        </div>

        {!payment.deletedAt && canVoid && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="outline"
                className="text-destructive"
                disabled={voidPayment.isPending}
              >
                <Ban className="mr-2 h-4 w-4" />
                {t('payments.voidPayment')}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t('payments.voidPaymentTitle')}</AlertDialogTitle>
                <AlertDialogDescription>
                  {t('payments.voidPaymentConfirm', { number: payment.paymentNumber })}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{tCommon('buttons.cancel')}</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => voidPayment.mutate(payment.id)}
                  className="bg-destructive hover:bg-destructive/90"
                >
                  {t('payments.voidPayment')}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <DollarSign className="h-4 w-4" />
              {t('payments.amount')}
            </div>
            <div className="text-2xl font-bold font-mono text-green-600">
              {formatCurrency(payment.amount)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <Calendar className="h-4 w-4" />
              {t('payments.date')}
            </div>
            <div className="text-2xl font-bold">
              {format(new Date(payment.date), 'MMM d, yyyy')}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <CreditCard className="h-4 w-4" />
              {t('payments.paymentMode')}
            </div>
            <div className="text-xl font-bold">{getPaymentModeLabel(payment.paymentMode)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <Building className="h-4 w-4" />
              {t('payments.depositedTo')}
            </div>
            <div className="text-lg font-bold truncate">
              {payment.depositToAccount?.name || '-'}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Details */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Customer Info */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              {t('payments.customerDetails')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {payment.customer ? (
              <>
                <div>
                  <div className="text-sm text-muted-foreground">{t('payments.customerName')}</div>
                  <Link
                    href={`/sales/customers/${payment.customer.id}`}
                    className="font-medium hover:underline"
                  >
                    {payment.customer.name}
                  </Link>
                </div>
                {payment.customer.email && (
                  <div>
                    <div className="text-sm text-muted-foreground">{t('customers.form.email')}</div>
                    <a
                      href={`mailto:${payment.customer.email}`}
                      className="text-blue-600 hover:underline"
                    >
                      {payment.customer.email}
                    </a>
                  </div>
                )}
              </>
            ) : (
              <p className="text-muted-foreground">{t('payments.noCustomerAssigned')}</p>
            )}
          </CardContent>
        </Card>

        {/* Payment Info */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              {t('payments.paymentDetails')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {payment.reference && (
              <div>
                <div className="text-sm text-muted-foreground">{t('payments.reference')}</div>
                <div className="font-medium">{payment.reference}</div>
              </div>
            )}
            {payment.depositToAccount && (
              <div>
                <div className="text-sm text-muted-foreground">{t('payments.depositAccount')}</div>
                <div className="font-medium">
                  {payment.depositToAccount.code} - {payment.depositToAccount.name}
                </div>
              </div>
            )}
            {payment.notes && (
              <div>
                <div className="text-sm text-muted-foreground">{t('payments.form.notes')}</div>
                <p className="whitespace-pre-wrap text-sm">{payment.notes}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Invoice Allocations */}
      {payment.allocations && payment.allocations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t('payments.invoiceAllocations')}</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('payments.invoiceNumber')}</TableHead>
                  <TableHead className="text-right">{t('payments.invoiceTotal')}</TableHead>
                  <TableHead className="text-right">{t('payments.balanceBefore')}</TableHead>
                  <TableHead className="text-right">{t('payments.amountApplied')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payment.allocations.map(
                  (allocation: {
                    invoiceId: string;
                    invoice?: { invoiceNumber?: string; grandTotal?: string; balanceDue?: string };
                    amount?: string;
                  }) => (
                    <TableRow key={allocation.invoiceId}>
                      <TableCell>
                        <Link
                          href={`/sales/invoices/${allocation.invoiceId}`}
                          className="font-medium hover:underline"
                        >
                          {allocation.invoice?.invoiceNumber || allocation.invoiceId}
                        </Link>
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatCurrency(allocation.invoice?.grandTotal || '0')}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatCurrency(
                          parseFloat(allocation.invoice?.balanceDue || '0') +
                            parseFloat(allocation.amount || '0'),
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono text-green-600 font-semibold">
                        {formatCurrency(allocation.amount || '0')}
                      </TableCell>
                    </TableRow>
                  ),
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
