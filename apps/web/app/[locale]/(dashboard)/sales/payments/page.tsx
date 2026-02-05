'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Plus, Search, RefreshCw, Eye, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  usePaymentsReceived,
  PaymentReceived,
  PaymentMode,
  getPaymentModeLabel,
  getPaymentModeOptions,
} from '@/lib/hooks/use-payments-received';
import { PaymentModeBadge } from '@/components/sales/status-badge';
import { usePermissions } from '@/lib/hooks/use-permissions';
import { format } from 'date-fns';

export default function PaymentsReceivedPage() {
  const { hasPermission } = usePermissions();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMode, setSelectedMode] = useState<string>('all');

  const { data: paymentsData, isLoading, refetch } = usePaymentsReceived({
    search: searchQuery || undefined,
    paymentMode: selectedMode !== 'all' ? (selectedMode as PaymentMode) : undefined,
  });

  const payments = paymentsData?.data || [];

  const canCreate = hasPermission('sales.create');

  const formatCurrency = (amount: string | number, currency: string = 'USD') => {
    const num = typeof amount === 'string' ? parseFloat(amount) : amount;
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
    }).format(num);
  };

  const paymentModeOptions = getPaymentModeOptions();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Payments Received</h1>
          <p className="text-muted-foreground">
            Track and manage customer payments
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canCreate && (
            <Button asChild>
              <Link href="/sales/payments/new">
                <Plus className="mr-2 h-4 w-4" />
                Record Payment
              </Link>
            </Button>
          )}
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by payment number or customer..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={selectedMode} onValueChange={setSelectedMode}>
              <SelectTrigger className="w-[180px]">
                <Filter className="mr-2 h-4 w-4" />
                <SelectValue placeholder="Filter by mode" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Modes</SelectItem>
                {paymentModeOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="icon" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Payments Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Payments</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : payments.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground mb-4">No payments found</p>
              {canCreate && (
                <Button asChild>
                  <Link href="/sales/payments/new">
                    <Plus className="mr-2 h-4 w-4" />
                    Record Your First Payment
                  </Link>
                </Button>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Payment #</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Mode</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.map((payment: PaymentReceived) => (
                  <TableRow key={payment.id}>
                    <TableCell>
                      <Link
                        href={`/sales/payments/${payment.id}`}
                        className="font-medium hover:underline"
                      >
                        {payment.paymentNumber}
                      </Link>
                    </TableCell>
                    <TableCell>
                      {payment.customer ? (
                        <Link
                          href={`/sales/customers/${payment.customer.id}`}
                          className="hover:underline"
                        >
                          {payment.customer.name}
                        </Link>
                      ) : (
                        '-'
                      )}
                    </TableCell>
                    <TableCell>
                      {format(new Date(payment.date), 'MMM d, yyyy')}
                    </TableCell>
                    <TableCell>
                      <PaymentModeBadge mode={payment.paymentMode} />
                    </TableCell>
                    <TableCell>{payment.reference || '-'}</TableCell>
                    <TableCell className="text-right font-mono text-green-600 font-semibold">
                      {formatCurrency(payment.amount)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" asChild>
                        <Link href={`/sales/payments/${payment.id}`}>
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
