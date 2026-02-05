'use client';

import Link from 'next/link';
import { format } from 'date-fns';
import { Plus, DollarSign, FileText } from 'lucide-react';
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
import { Skeleton } from '@/components/ui/skeleton';
import { useVATPayments, formatCurrency, VATPayment } from '@/lib/hooks/use-tax';

export default function VATPaymentsPage() {
  const { data, isLoading } = useVATPayments();
  const payments: VATPayment[] = data?.data || [];

  const totalPaid = payments.reduce((sum, p) => {
    const amount = typeof p.amount === 'string' ? parseFloat(p.amount) : p.amount;
    return sum + (amount || 0);
  }, 0);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-10 w-32" />
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">VAT Payments</h1>
          <p className="text-muted-foreground">
            Track VAT payments to tax authorities
          </p>
        </div>
        <Button asChild>
          <Link href="/tax/payments/new">
            <Plus className="mr-2 h-4 w-4" />
            Record Payment
          </Link>
        </Button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <FileText className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Payments</p>
                <p className="text-2xl font-bold">{payments.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <DollarSign className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Paid</p>
                <p className="text-2xl font-bold font-mono">
                  {formatCurrency(totalPaid)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      {payments.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-12">
              <DollarSign className="mx-auto h-12 w-12 text-muted-foreground" />
              <h3 className="mt-4 text-lg font-semibold">No payments found</h3>
              <p className="text-muted-foreground">
                Record your first VAT payment to get started.
              </p>
              <Button asChild className="mt-4">
                <Link href="/tax/payments/new">Record Payment</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="pt-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>VAT Return Period</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead>Bank Account</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.map((payment) => (
                  <TableRow key={payment.id}>
                    <TableCell>
                      {format(new Date(payment.paymentDate), 'MMM d, yyyy')}
                    </TableCell>
                    <TableCell>
                      {payment.vatReturn && (
                        <Link
                          href={`/tax/returns/${payment.vatReturnId}`}
                          className="text-blue-600 hover:underline"
                        >
                          {format(new Date(payment.vatReturn.startDate), 'MMM')} -{' '}
                          {format(new Date(payment.vatReturn.endDate), 'MMM yyyy')}
                        </Link>
                      )}
                    </TableCell>
                    <TableCell>{payment.reference || '-'}</TableCell>
                    <TableCell>{payment.bankAccount?.name || '-'}</TableCell>
                    <TableCell className="text-right font-mono font-medium">
                      {formatCurrency(payment.amount)}
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
