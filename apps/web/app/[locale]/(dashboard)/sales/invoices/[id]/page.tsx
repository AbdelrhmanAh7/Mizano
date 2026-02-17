'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Edit,
  Send,
  Ban,
  Trash2,
  CreditCard,
  FileText,
  User,
  Calendar,
  DollarSign,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter,
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
import {
  useInvoice,
  useDeleteInvoice,
  useSendInvoice,
  useVoidInvoice,
  getInvoiceStatusColor,
  getInvoiceStatusLabel,
} from '@/lib/hooks/use-invoices';
import { usePermissions } from '@/lib/hooks/use-permissions';
import { InvoiceStatusBadge } from '@/components/sales/status-badge';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

export default function InvoiceDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const { hasPermission } = usePermissions();
  const invoiceId = params.id as string;

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [sendDialogOpen, setSendDialogOpen] = useState(false);
  const [voidDialogOpen, setVoidDialogOpen] = useState(false);

  const { data: invoice, isLoading } = useInvoice(invoiceId);
  const deleteInvoice = useDeleteInvoice();
  const sendInvoice = useSendInvoice();
  const voidInvoice = useVoidInvoice();

  const canEdit = hasPermission('sales.edit');
  const canDelete = hasPermission('sales.delete');

  const formatCurrency = (amount: string | number, currency: string = 'USD') => {
    const num = typeof amount === 'string' ? parseFloat(amount) : amount;
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
    }).format(num);
  };

  const confirmDelete = async () => {
    try {
      await deleteInvoice.mutateAsync(invoiceId);
      router.push('/sales/invoices');
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.response?.data?.message || 'Failed to delete invoice',
        variant: 'destructive',
      });
    }
    setDeleteDialogOpen(false);
  };

  const confirmSend = async () => {
    try {
      await sendInvoice.mutateAsync(invoiceId);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.response?.data?.message || 'Failed to send invoice',
        variant: 'destructive',
      });
    }
    setSendDialogOpen(false);
  };

  const confirmVoid = async () => {
    try {
      await voidInvoice.mutateAsync(invoiceId);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.response?.data?.message || 'Failed to void invoice',
        variant: 'destructive',
      });
    }
    setVoidDialogOpen(false);
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
        <Skeleton className="h-[400px]" />
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild aria-label="Go back">
            <Link href="/sales/invoices">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Invoice Not Found</h1>
          </div>
        </div>
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">
              The invoice you&apos;re looking for doesn&apos;t exist.
            </p>
            <Button asChild className="mt-4">
              <Link href="/sales/invoices">Back to Invoices</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const grandTotal = parseFloat(invoice.grandTotal || '0');
  const balanceDue = parseFloat(invoice.balanceDue || '0');
  const amountPaid = grandTotal - balanceDue;
  const isOverdue = invoice.status === 'OVERDUE';
  const isDraft = invoice.status === 'DRAFT';
  const isVoid = invoice.status === 'VOID';
  const isPaid = invoice.status === 'PAID';

  // Get payment allocations and credit notes from the invoice response
  const paymentAllocations = (invoice as any).paymentAllocations || [];
  const creditNotes = (invoice as any).creditNotes || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild aria-label="Go back">
            <Link href="/sales/invoices">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight">{invoice.invoiceNumber}</h1>
              <InvoiceStatusBadge status={invoice.status} />
            </div>
            {invoice.customer && (
              <Link
                href={`/sales/customers/${invoice.customer.id}`}
                className="text-muted-foreground hover:underline"
              >
                {invoice.customer.name}
              </Link>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {canEdit && isDraft && (
            <>
              <Button variant="outline" asChild>
                <Link href={`/sales/invoices/${invoiceId}/edit`}>
                  <Edit className="mr-2 h-4 w-4" />
                  Edit
                </Link>
              </Button>
              <Button onClick={() => setSendDialogOpen(true)}>
                <Send className="mr-2 h-4 w-4" />
                Send
              </Button>
            </>
          )}
          {canEdit && !isVoid && !isDraft && !isPaid && (
            <Button asChild>
              <Link href={`/sales/payments/new?invoiceId=${invoiceId}`}>
                <CreditCard className="mr-2 h-4 w-4" />
                Record Payment
              </Link>
            </Button>
          )}
          {canEdit && !isVoid && !isDraft && (
            <Button
              variant="outline"
              onClick={() => setVoidDialogOpen(true)}
              className="text-orange-600 hover:text-orange-700"
            >
              <Ban className="mr-2 h-4 w-4" />
              Void
            </Button>
          )}
          {canDelete && isDraft && (
            <Button variant="destructive" onClick={() => setDeleteDialogOpen(true)}>
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </Button>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <DollarSign className="h-4 w-4" />
              Grand Total
            </div>
            <div className="text-2xl font-bold font-mono">{formatCurrency(grandTotal)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <CreditCard className="h-4 w-4" />
              Amount Paid
            </div>
            <div className="text-2xl font-bold font-mono text-green-600">
              {formatCurrency(amountPaid)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <DollarSign className="h-4 w-4" />
              Balance Due
            </div>
            <div className={cn('text-2xl font-bold font-mono', balanceDue > 0 && 'text-red-600')}>
              {formatCurrency(balanceDue)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <Calendar className="h-4 w-4" />
              Due Date
            </div>
            <div className={cn('text-2xl font-bold', isOverdue && 'text-red-600')}>
              {format(new Date(invoice.dueDate), 'MMM d, yyyy')}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Invoice Details and Line Items */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Line Items - Full Width on Mobile, 2/3 on Desktop */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Line Items
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[40%]">Description</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Rate</TableHead>
                  <TableHead className="text-right">Discount</TableHead>
                  <TableHead className="text-right">Tax</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoice.lines && invoice.lines.length > 0 ? (
                  invoice.lines.map((line: any, index: number) => (
                    <TableRow key={line.id || index}>
                      <TableCell>
                        <div>
                          {line.item && (
                            <span className="text-xs text-muted-foreground block">
                              {line.item.sku}
                            </span>
                          )}
                          {line.description}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {parseFloat(line.quantity || '0').toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatCurrency(line.rate || '0')}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {parseFloat(line.discount || '0').toFixed(0)}%
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {parseFloat(line.taxRate || '0').toFixed(0)}%
                      </TableCell>
                      <TableCell className="text-right font-mono font-medium">
                        {formatCurrency(line.amount || '0')}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      No line items
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={5} className="text-right">
                    Subtotal
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatCurrency(invoice.subtotal || '0')}
                  </TableCell>
                </TableRow>
                {parseFloat(invoice.taxAmount || '0') > 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-right">
                      Tax
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {formatCurrency(invoice.taxAmount || '0')}
                    </TableCell>
                  </TableRow>
                )}
                {parseFloat(invoice.shippingAmount || '0') > 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-right">
                      Shipping
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {formatCurrency(invoice.shippingAmount || '0')}
                    </TableCell>
                  </TableRow>
                )}
                <TableRow className="font-bold">
                  <TableCell colSpan={5} className="text-right">
                    Grand Total
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatCurrency(invoice.grandTotal || '0')}
                  </TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </CardContent>
        </Card>

        {/* Invoice Info Sidebar */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Customer Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {invoice.customer ? (
                <>
                  <div>
                    <div className="text-sm text-muted-foreground">Name</div>
                    <Link
                      href={`/sales/customers/${invoice.customer.id}`}
                      className="font-medium hover:underline"
                    >
                      {invoice.customer.name}
                    </Link>
                  </div>
                  {invoice.customer.email && (
                    <div>
                      <div className="text-sm text-muted-foreground">Email</div>
                      <a
                        href={`mailto:${invoice.customer.email}`}
                        className="text-blue-600 hover:underline"
                      >
                        {invoice.customer.email}
                      </a>
                    </div>
                  )}
                </>
              ) : (
                <p className="text-muted-foreground">No customer assigned</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Dates
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="text-sm text-muted-foreground">Invoice Date</div>
                <div className="font-medium">{format(new Date(invoice.date), 'MMMM d, yyyy')}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Due Date</div>
                <div className={cn('font-medium', isOverdue && 'text-red-600')}>
                  {format(new Date(invoice.dueDate), 'MMMM d, yyyy')}
                  {isOverdue && ' (Overdue)'}
                </div>
              </div>
            </CardContent>
          </Card>

          {(invoice.notes || invoice.terms) && (
            <Card>
              <CardHeader>
                <CardTitle>Additional Info</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {invoice.notes && (
                  <div>
                    <div className="text-sm text-muted-foreground">Notes</div>
                    <p className="whitespace-pre-wrap text-sm">{invoice.notes}</p>
                  </div>
                )}
                {invoice.terms && (
                  <div>
                    <div className="text-sm text-muted-foreground">Terms</div>
                    <p className="whitespace-pre-wrap text-sm">{invoice.terms}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Payment History */}
      {paymentAllocations.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Payment History
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Payment #</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Amount Applied</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paymentAllocations.map((allocation: any) => (
                  <TableRow key={allocation.id}>
                    <TableCell>
                      <Link
                        href={`/sales/payments/${allocation.payment?.id}`}
                        className="font-medium hover:underline"
                      >
                        {allocation.payment?.paymentNumber}
                      </Link>
                    </TableCell>
                    <TableCell>
                      {allocation.payment?.date
                        ? format(new Date(allocation.payment.date), 'MMM d, yyyy')
                        : '-'}
                    </TableCell>
                    <TableCell className="text-right font-mono text-green-600">
                      {formatCurrency(allocation.amount || '0')}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Credit Notes */}
      {creditNotes.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Credit Notes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Credit Note #</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {creditNotes.map((creditNote: any) => (
                  <TableRow key={creditNote.id}>
                    <TableCell>
                      <Link
                        href={`/sales/credit-notes/${creditNote.id}`}
                        className="font-medium hover:underline"
                      >
                        {creditNote.creditNoteNumber}
                      </Link>
                    </TableCell>
                    <TableCell>
                      {creditNote.date ? format(new Date(creditNote.date), 'MMM d, yyyy') : '-'}
                    </TableCell>
                    <TableCell className="text-right font-mono text-orange-600">
                      {formatCurrency(creditNote.amount || '0')}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Invoice</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete invoice &quot;{invoice.invoiceNumber}&quot;? This
              action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-red-600 hover:bg-red-700">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Send Confirmation Dialog */}
      <AlertDialog open={sendDialogOpen} onOpenChange={setSendDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Send Invoice</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to mark invoice &quot;{invoice.invoiceNumber}&quot; as sent?
              This will create an accounting entry and you won&apos;t be able to edit it anymore.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmSend}>Send Invoice</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Void Confirmation Dialog */}
      <AlertDialog open={voidDialogOpen} onOpenChange={setVoidDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Void Invoice</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to void invoice &quot;{invoice.invoiceNumber}&quot;? This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmVoid} className="bg-orange-600 hover:bg-orange-700">
              Void Invoice
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
