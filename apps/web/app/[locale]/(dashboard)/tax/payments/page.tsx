'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { format } from 'date-fns';
import { CreditCard, DollarSign, Hash, Calendar, Eye } from 'lucide-react';
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
  useVATReturns,
  formatCurrency,
  normalizeVATReturn,
  VATReturn,
  VATPayment,
} from '@/lib/hooks/use-tax';

interface PaymentRow {
  payment: VATPayment;
  vatReturn: VATReturn;
}

export default function VATPaymentsPage() {
  const t = useTranslations('tax');

  const { data: returnsData, isLoading } = useVATReturns();
  const rawReturns: VATReturn[] = returnsData?.data || returnsData || [];
  const returns = useMemo(() => rawReturns.map(normalizeVATReturn), [rawReturns]);

  // Extract payments from returns that have them
  const paymentRows: PaymentRow[] = useMemo(
    () =>
      returns
        .filter((r) => r.payment)
        .map((r) => ({
          payment: r.payment!,
          vatReturn: r,
        }))
        .sort(
          (a, b) =>
            new Date(b.payment.date || b.payment.createdAt).getTime() -
            new Date(a.payment.date || a.payment.createdAt).getTime(),
        ),
    [returns],
  );

  const totalPaid = paymentRows.reduce(
    (sum, pr) =>
      sum +
      (typeof pr.payment.amount === 'string' ? parseFloat(pr.payment.amount) : pr.payment.amount),
    0,
  );

  const latestPaymentDate =
    paymentRows.length > 0
      ? new Date(paymentRows[0].payment.date || paymentRows[0].payment.createdAt)
      : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('payments.title')}</h1>
          <p className="text-muted-foreground">{t('payments.description')}</p>
        </div>
        <Button asChild variant="outline">
          <Link href="/tax/returns">{t('payments.viewReturns')}</Link>
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('payments.summary.totalPaid')}</CardTitle>
            <DollarSign className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <div className="text-2xl font-bold text-green-600 font-mono">
                {formatCurrency(totalPaid)}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {t('payments.summary.paymentsCount')}
            </CardTitle>
            <Hash className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <div className="text-2xl font-bold">{paymentRows.length}</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {t('payments.summary.latestPayment')}
            </CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <div className="text-lg font-bold">
                {latestPaymentDate ? format(latestPaymentDate, 'MMM d, yyyy') : '-'}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Payments Table */}
      <Card>
        <CardHeader>
          <CardTitle>{t('payments.allPayments')}</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : paymentRows.length === 0 ? (
            <div className="text-center py-12">
              <CreditCard className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">{t('payments.noPayments')}</h3>
              <p className="text-muted-foreground mb-4 max-w-md mx-auto">
                {t('payments.noPaymentsDesc')}
              </p>
              <Button asChild>
                <Link href="/tax/returns">{t('payments.viewReturns')}</Link>
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('payments.table.returnNumber')}</TableHead>
                  <TableHead>{t('payments.table.period')}</TableHead>
                  <TableHead className="text-right">{t('payments.table.amount')}</TableHead>
                  <TableHead>{t('payments.table.date')}</TableHead>
                  <TableHead>{t('payments.table.reference')}</TableHead>
                  <TableHead className="text-right" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {paymentRows.map((pr) => (
                  <TableRow key={pr.payment.id}>
                    <TableCell>
                      <Link
                        href={`/tax/returns/${pr.vatReturn.id}`}
                        className="font-medium hover:underline"
                      >
                        {pr.vatReturn.returnNumber || '-'}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm">
                      {format(new Date(pr.vatReturn.startDate), 'MMM d')} -{' '}
                      {format(new Date(pr.vatReturn.endDate), 'MMM d, yyyy')}
                    </TableCell>
                    <TableCell className="text-right font-mono font-semibold">
                      {formatCurrency(pr.payment.amount)}
                    </TableCell>
                    <TableCell>
                      {format(new Date(pr.payment.date || pr.payment.createdAt), 'MMM d, yyyy')}
                    </TableCell>
                    <TableCell>
                      {pr.payment.reference ? (
                        <Badge variant="outline">{pr.payment.reference}</Badge>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button asChild variant="ghost" size="sm">
                        <Link href={`/tax/returns/${pr.vatReturn.id}`}>
                          <Eye className="h-4 w-4" />
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
