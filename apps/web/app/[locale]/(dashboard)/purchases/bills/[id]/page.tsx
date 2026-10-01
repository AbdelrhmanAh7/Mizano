'use client';

import Link from 'next/link';
import { useState } from 'react';
import { format } from 'date-fns';
import { useTranslations } from 'next-intl';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Edit, Send, DollarSign, Ban } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
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
import { paymentsMadeApi } from '@/lib/api';
import { getApiErrorMessage } from '@/lib/api-error';
import {
  compareDecimals,
  isPositiveDecimal,
  normalizeDecimal,
  subtractDecimals,
} from '@/lib/decimal';
import {
  useBill,
  useApproveBill,
  formatCurrency,
  getStatusVariant,
  getStatusText,
} from '@/lib/hooks/use-bills';
import { invalidateLedgerQueries } from '@/lib/hooks/use-journals';
import { usePermissions } from '@/lib/hooks/use-permissions';
import { cn } from '@/lib/utils';
import { documentCurrency, useBaseCurrency } from '@/lib/hooks/use-organization';

const PAYABLE_STATUSES = ['OPEN', 'OVERDUE', 'PARTIALLY_PAID'];

interface BillPaymentRow {
  allocationId: string;
  paymentId: string;
  paymentNumber: string;
  date: string;
  /** Amount of the payment allocated to this bill (decimal string). */
  amount: string;
}

interface BillDetailPageProps {
  params: { id: string };
}

export default function BillDetailPage({ params }: BillDetailPageProps) {
  const { id } = params;
  const t = useTranslations('purchases');
  const baseCurrency = useBaseCurrency();
  const tCommon = useTranslations('common');
  const { hasPermission } = usePermissions();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: bill, isLoading } = useBill(id);
  const approveBill = useApproveBill();
  const [paymentToVoid, setPaymentToVoid] = useState<BillPaymentRow | null>(null);
  const [isVoiding, setIsVoiding] = useState(false);

  const canEdit = hasPermission('purchases.edit');
  const canVoid = hasPermission('purchases.delete');

  const handleApprove = async () => {
    try {
      await approveBill.mutateAsync(id);
      toast({ title: t('bills.approved') });
    } catch (error) {
      toast({
        title: t('bills.approveFailed'),
        description: getApiErrorMessage(error, t('bills.approveFailed')),
        variant: 'destructive',
      });
    }
  };

  const confirmVoidPayment = async () => {
    if (!paymentToVoid) return;
    setIsVoiding(true);
    try {
      await paymentsMadeApi.void(paymentToVoid.paymentId);
      await Promise.all([
        invalidateLedgerQueries(queryClient),
        queryClient.invalidateQueries({ queryKey: ['bills', id] }),
      ]);
      toast({ title: t('bills.paymentVoided'), description: paymentToVoid.paymentNumber });
    } catch (error) {
      toast({
        title: t('bills.voidFailed'),
        description: getApiErrorMessage(error, t('bills.voidFailed')),
        variant: 'destructive',
      });
    } finally {
      setIsVoiding(false);
      setPaymentToVoid(null);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (!bill) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">{tCommon('errors.notFound')}</p>
        <Button asChild className="mt-4">
          <Link href="/purchases/bills">{tCommon('buttons.back')}</Link>
        </Button>
      </div>
    );
  }

  const grandTotal = bill.grandTotal;
  const balanceDue = bill.balanceDue;
  const hasBalance = isPositiveDecimal(balanceDue);
  const paymentRows: BillPaymentRow[] = (bill.billAllocations ?? []).flatMap((allocation) => {
    // The bill endpoint returns each allocation's payment; voided payments are excluded.
    const payment = allocation.payment;
    return payment && !payment.deletedAt
      ? [
          {
            allocationId: allocation.id,
            paymentId: payment.id,
            paymentNumber: payment.paymentNumber,
            date: payment.date,
            amount: allocation.amount,
          },
        ]
      : [];
  });
  const isOverdue =
    bill.status === 'OVERDUE' || (bill.status === 'OPEN' && new Date(bill.dueDate) < new Date());
  // A bill without its own currency is posted in the base currency, so it is shown in it.
  const currency = documentCurrency(bill.currencyCode, baseCurrency);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild aria-label="Go back">
            <Link href="/purchases/bills">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight font-mono">{bill.billNumber}</h1>
              <Badge variant={getStatusVariant(bill.status)}>{getStatusText(bill.status)}</Badge>
            </div>
            <p className="text-muted-foreground">From {bill.vendor?.name}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {canEdit && bill.status === 'DRAFT' && (
            <>
              <Button variant="outline" asChild>
                <Link href={`/purchases/bills/${bill.id}/edit`}>
                  <Edit className="mr-2 h-4 w-4" />
                  {tCommon('buttons.edit')}
                </Link>
              </Button>
              <Button onClick={handleApprove} disabled={approveBill.isPending}>
                <Send className="mr-2 h-4 w-4" />
                {approveBill.isPending ? tCommon('loading.processing') : t('bills.approvePost')}
              </Button>
            </>
          )}
          {PAYABLE_STATUSES.includes(bill.status) && (
            <Button asChild>
              <Link href={`/purchases/payments/new?billId=${bill.id}&vendorId=${bill.vendorId}`}>
                <DollarSign className="mr-2 h-4 w-4" />
                {t('bills.recordPayment')}
              </Link>
            </Button>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t('bills.table.amount')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono">
              {formatCurrency(grandTotal, currency)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t('bills.table.balance')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className={cn(
                'text-2xl font-bold font-mono',
                hasBalance ? 'text-destructive' : 'text-success',
              )}
            >
              {formatCurrency(balanceDue, currency)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t('bills.form.date')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{format(new Date(bill.date), 'MMM d, yyyy')}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t('bills.form.dueDate')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className={cn('text-2xl font-bold', isOverdue && 'text-destructive')}>
              {format(new Date(bill.dueDate), 'MMM d, yyyy')}
            </div>
            {isOverdue && <p className="text-sm text-destructive">{t('bills.status.overdue')}</p>}
          </CardContent>
        </Card>
      </div>

      {/* Line Items */}
      <Card>
        <CardHeader>
          <CardTitle>{t('lineItems.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          {bill.lines && bill.lines.length > 0 ? (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('lineItems.description')}</TableHead>
                    <TableHead className="text-right">{t('lineItems.quantity')}</TableHead>
                    <TableHead className="text-right">{t('lineItems.rate')}</TableHead>
                    <TableHead className="text-right">{t('lineItems.tax')}</TableHead>
                    <TableHead className="text-right">{t('lineItems.amount')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bill.lines.map((line, index) => {
                    const qty = normalizeDecimal(String(line.quantity), 0);
                    const rate = String(line.rate);
                    const amount = String(line.amount ?? '0');
                    const taxRate = normalizeDecimal(String(line.taxRate || 0), 0);

                    return (
                      <TableRow key={line.id || index}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{line.description}</p>
                            {line.item && (
                              <p className="text-sm text-muted-foreground">SKU: {line.item.sku}</p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-mono">{qty}</TableCell>
                        <TableCell className="text-right font-mono">
                          {formatCurrency(rate, currency)}
                        </TableCell>
                        <TableCell className="text-right">{taxRate}%</TableCell>
                        <TableCell className="text-right font-mono font-medium">
                          {formatCurrency(amount, currency)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>

              {/* Totals */}
              <div className="mt-6 flex justify-end">
                <div className="w-64 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>{tCommon('subtotal')}</span>
                    <span className="font-mono">{formatCurrency(bill.subtotal, currency)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>{tCommon('tax')}</span>
                    <span className="font-mono">{formatCurrency(bill.taxAmount, currency)}</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between text-lg font-bold">
                    <span>{tCommon('total')}</span>
                    <span className="font-mono">{formatCurrency(grandTotal, currency)}</span>
                  </div>
                  {compareDecimals(balanceDue, grandTotal) !== 0 && (
                    <>
                      <div className="flex justify-between text-sm text-muted-foreground">
                        <span>{t('bills.status.paid')}</span>
                        <span className="font-mono">
                          {formatCurrency(subtractDecimals(grandTotal, balanceDue), currency)}
                        </span>
                      </div>
                      <div
                        className={cn(
                          'flex justify-between text-lg font-bold',
                          hasBalance && 'text-destructive',
                        )}
                      >
                        <span>{t('bills.table.balance')}</span>
                        <span className="font-mono">{formatCurrency(balanceDue, currency)}</span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="text-center py-8 text-muted-foreground">No line items</div>
          )}
        </CardContent>
      </Card>

      {/* Payments */}
      {bill.status !== 'DRAFT' && (
        <Card>
          <CardHeader>
            <CardTitle>{t('bills.payments')}</CardTitle>
          </CardHeader>
          <CardContent>
            {paymentRows.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                {t('bills.noPayments')}
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('payments.table.paymentNumber')}</TableHead>
                    <TableHead>{t('payments.table.date')}</TableHead>
                    <TableHead className="text-right">{t('payments.table.allocated')}</TableHead>
                    {canVoid && <TableHead className="w-[1%]" />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paymentRows.map((row) => (
                    <TableRow key={row.allocationId}>
                      <TableCell className="font-mono">
                        <Link
                          href={`/purchases/payments/${row.paymentId}`}
                          className="hover:underline"
                        >
                          {row.paymentNumber}
                        </Link>
                      </TableCell>
                      <TableCell>{format(new Date(row.date), 'MMM d, yyyy')}</TableCell>
                      <TableCell className="text-right font-mono">
                        {formatCurrency(row.amount, currency)}
                      </TableCell>
                      {canVoid && (
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive"
                            onClick={() => setPaymentToVoid(row)}
                            disabled={isVoiding}
                          >
                            <Ban className="mr-2 h-4 w-4" />
                            {t('bills.voidPayment')}
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {/* Notes */}
      {bill.notes && (
        <Card>
          <CardHeader>
            <CardTitle>{t('bills.form.notes')}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap">{bill.notes}</p>
          </CardContent>
        </Card>
      )}

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            <Button variant="outline" asChild>
              <Link href={`/purchases/vendors/${bill.vendorId}`}>View Vendor</Link>
            </Button>
            {bill.projectId && (
              <Button variant="outline" asChild>
                <Link href={`/projects/${bill.projectId}`}>View Project</Link>
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Void Payment Confirmation */}
      <AlertDialog
        open={!!paymentToVoid}
        onOpenChange={(open) => !open && !isVoiding && setPaymentToVoid(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('bills.voidPaymentTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('bills.voidPaymentConfirm', { number: paymentToVoid?.paymentNumber ?? '' })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isVoiding}>{tCommon('buttons.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmVoidPayment}
              disabled={isVoiding}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t('bills.voidPayment')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
