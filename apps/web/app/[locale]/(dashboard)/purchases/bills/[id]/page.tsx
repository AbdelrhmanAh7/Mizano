'use client';

import { use } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { ArrowLeft, Edit, Send, DollarSign, FileText } from 'lucide-react';
import { useRouter } from 'next/navigation';
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
  useBill,
  useOpenBill,
  formatCurrency,
  getStatusVariant,
  getStatusText,
} from '@/lib/hooks/use-bills';
import { usePermissions } from '@/lib/hooks/use-permissions';
import { cn } from '@/lib/utils';

interface BillDetailPageProps {
  params: Promise<{ id: string }>;
}

export default function BillDetailPage({ params }: BillDetailPageProps) {
  const { id } = use(params);
  const router = useRouter();
  const { hasPermission } = usePermissions();
  const { data: bill, isLoading } = useBill(id);
  const openBill = useOpenBill();

  const canEdit = hasPermission('purchases.edit');

  const handleOpen = async () => {
    try {
      await openBill.mutateAsync(id);
    } catch (error) {
      // Error is handled in the hook
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
        <p className="text-muted-foreground">Bill not found</p>
        <Button asChild className="mt-4">
          <Link href="/purchases/bills">Back to Bills</Link>
        </Button>
      </div>
    );
  }

  const grandTotal = parseFloat(bill.grandTotal);
  const balanceDue = parseFloat(bill.balanceDue);
  const isOverdue = bill.status === 'OVERDUE' || (
    bill.status === 'OPEN' && new Date(bill.dueDate) < new Date()
  );
  const currency = bill.vendor?.currency || 'USD';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/purchases/bills">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight font-mono">
                {bill.billNumber}
              </h1>
              <Badge variant={getStatusVariant(bill.status)}>
                {getStatusText(bill.status)}
              </Badge>
            </div>
            <p className="text-muted-foreground">
              From {bill.vendor?.name}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {canEdit && bill.status === 'DRAFT' && (
            <>
              <Button variant="outline" asChild>
                <Link href={`/purchases/bills/${bill.id}/edit`}>
                  <Edit className="mr-2 h-4 w-4" />
                  Edit
                </Link>
              </Button>
              <Button onClick={handleOpen} disabled={openBill.isPending}>
                <Send className="mr-2 h-4 w-4" />
                {openBill.isPending ? 'Opening...' : 'Open Bill'}
              </Button>
            </>
          )}
          {(bill.status === 'OPEN' || bill.status === 'OVERDUE' || bill.status === 'PARTIAL') && (
            <Button asChild>
              <Link href={`/purchases/payments/new?billId=${bill.id}&vendorId=${bill.vendorId}`}>
                <DollarSign className="mr-2 h-4 w-4" />
                Record Payment
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
              Total Amount
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
              Balance Due
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className={cn(
              'text-2xl font-bold font-mono',
              balanceDue > 0 ? 'text-red-600' : 'text-green-600'
            )}>
              {formatCurrency(balanceDue, currency)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Bill Date
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {format(new Date(bill.date), 'MMM d, yyyy')}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Due Date
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className={cn(
              'text-2xl font-bold',
              isOverdue && 'text-red-600'
            )}>
              {format(new Date(bill.dueDate), 'MMM d, yyyy')}
            </div>
            {isOverdue && (
              <p className="text-sm text-red-600">Overdue</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Line Items */}
      <Card>
        <CardHeader>
          <CardTitle>Line Items</CardTitle>
        </CardHeader>
        <CardContent>
          {bill.lines && bill.lines.length > 0 ? (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Rate</TableHead>
                    <TableHead className="text-right">Tax</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bill.lines.map((line, index) => {
                    const qty = parseFloat(String(line.quantity));
                    const rate = parseFloat(String(line.rate));
                    const amount = qty * rate;
                    const taxRate = parseFloat(String(line.taxRate || 0));

                    return (
                      <TableRow key={line.id || index}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{line.description}</p>
                            {line.item && (
                              <p className="text-sm text-muted-foreground">
                                SKU: {line.item.sku}
                              </p>
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
                    <span>Subtotal</span>
                    <span className="font-mono">{formatCurrency(bill.subtotal, currency)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>Tax</span>
                    <span className="font-mono">{formatCurrency(bill.taxAmount, currency)}</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between text-lg font-bold">
                    <span>Total</span>
                    <span className="font-mono">{formatCurrency(grandTotal, currency)}</span>
                  </div>
                  {balanceDue !== grandTotal && (
                    <>
                      <div className="flex justify-between text-sm text-muted-foreground">
                        <span>Paid</span>
                        <span className="font-mono">{formatCurrency(grandTotal - balanceDue, currency)}</span>
                      </div>
                      <div className="flex justify-between text-lg font-bold text-red-600">
                        <span>Balance Due</span>
                        <span className="font-mono">{formatCurrency(balanceDue, currency)}</span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              No line items
            </div>
          )}
        </CardContent>
      </Card>

      {/* Notes */}
      {bill.notes && (
        <Card>
          <CardHeader>
            <CardTitle>Notes</CardTitle>
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
              <Link href={`/purchases/vendors/${bill.vendorId}`}>
                View Vendor
              </Link>
            </Button>
            {bill.projectId && (
              <Button variant="outline" asChild>
                <Link href={`/projects/${bill.projectId}`}>
                  View Project
                </Link>
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
