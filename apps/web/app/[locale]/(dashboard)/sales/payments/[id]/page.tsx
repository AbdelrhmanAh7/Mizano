'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, User, Calendar, CreditCard, DollarSign, Building } from 'lucide-react';
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
import { usePaymentReceived, getPaymentModeLabel } from '@/lib/hooks/use-payments-received';
import { PaymentModeBadge } from '@/components/sales/status-badge';
import { format } from 'date-fns';

export default function PaymentReceivedDetailPage() {
  const params = useParams();
  const paymentId = params.id as string;

  const { data: payment, isLoading } = usePaymentReceived(paymentId);

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
          <Button variant="ghost" size="icon" asChild aria-label="Go back">
            <Link href="/sales/payments">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Payment Not Found</h1>
          </div>
        </div>
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">
              The payment you&apos;re looking for doesn&apos;t exist.
            </p>
            <Button asChild className="mt-4">
              <Link href="/sales/payments">Back to Payments</Link>
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
          <Button variant="ghost" size="icon" asChild aria-label="Go back">
            <Link href="/sales/payments">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight">{payment.paymentNumber}</h1>
              <PaymentModeBadge mode={payment.paymentMode} />
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
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <DollarSign className="h-4 w-4" />
              Amount
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
              Date
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
              Payment Mode
            </div>
            <div className="text-xl font-bold">{getPaymentModeLabel(payment.paymentMode)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <Building className="h-4 w-4" />
              Deposited To
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
              Customer Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {payment.customer ? (
              <>
                <div>
                  <div className="text-sm text-muted-foreground">Customer Name</div>
                  <Link
                    href={`/sales/customers/${payment.customer.id}`}
                    className="font-medium hover:underline"
                  >
                    {payment.customer.name}
                  </Link>
                </div>
                {payment.customer.email && (
                  <div>
                    <div className="text-sm text-muted-foreground">Email</div>
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
              <p className="text-muted-foreground">No customer assigned</p>
            )}
          </CardContent>
        </Card>

        {/* Payment Info */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Payment Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {payment.reference && (
              <div>
                <div className="text-sm text-muted-foreground">Reference</div>
                <div className="font-medium">{payment.reference}</div>
              </div>
            )}
            {payment.depositToAccount && (
              <div>
                <div className="text-sm text-muted-foreground">Deposit Account</div>
                <div className="font-medium">
                  {payment.depositToAccount.code} - {payment.depositToAccount.name}
                </div>
              </div>
            )}
            {payment.notes && (
              <div>
                <div className="text-sm text-muted-foreground">Notes</div>
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
            <CardTitle>Invoice Allocations</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice #</TableHead>
                  <TableHead className="text-right">Invoice Total</TableHead>
                  <TableHead className="text-right">Balance Before</TableHead>
                  <TableHead className="text-right">Amount Applied</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payment.allocations.map((allocation: any) => (
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
                      {formatCurrency(allocation.amount)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
