'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Edit, Trash2, Send, FileText, Ban, CheckCircle } from 'lucide-react';
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
  useQuote,
  useDeleteQuote,
  useSendQuote,
  useAcceptQuote,
  useDeclineQuote,
  useConvertToInvoice,
} from '@/lib/hooks/use-quotes';
import { usePermissions } from '@/lib/hooks/use-permissions';
import { QuoteStatusBadge } from '@/components/sales/status-badge';
import { formatCurrency } from '@/lib/hooks/use-customers';
import { format } from 'date-fns';

export default function QuoteDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const { hasPermission } = usePermissions();
  const quoteId = params.id as string;

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [convertDialogOpen, setConvertDialogOpen] = useState(false);

  const { data: quote, isLoading } = useQuote(quoteId);
  const deleteQuote = useDeleteQuote();
  const sendQuote = useSendQuote();
  const acceptQuote = useAcceptQuote();
  const declineQuote = useDeclineQuote();
  const convertToInvoice = useConvertToInvoice();

  const canEdit = hasPermission('sales.edit');
  const canDelete = hasPermission('sales.delete');

  const confirmDelete = async () => {
    try {
      await deleteQuote.mutateAsync(quoteId);
      toast({
        title: 'Quote deleted',
        description: 'The quote has been deleted.',
      });
      router.push('/sales/quotes');
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.response?.data?.message || 'Failed to delete quote.',
        variant: 'destructive',
      });
    }
    setDeleteDialogOpen(false);
  };

  const handleSend = async () => {
    try {
      await sendQuote.mutateAsync(quoteId);
      toast({
        title: 'Quote sent',
        description: 'The quote has been marked as sent.',
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.response?.data?.message || 'Failed to send quote.',
        variant: 'destructive',
      });
    }
  };

  const handleAccept = async () => {
    try {
      await acceptQuote.mutateAsync(quoteId);
      toast({
        title: 'Quote accepted',
        description: 'The quote has been marked as accepted.',
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.response?.data?.message || 'Failed to accept quote.',
        variant: 'destructive',
      });
    }
  };

  const handleDecline = async () => {
    try {
      await declineQuote.mutateAsync(quoteId);
      toast({
        title: 'Quote declined',
        description: 'The quote has been marked as declined.',
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.response?.data?.message || 'Failed to decline quote.',
        variant: 'destructive',
      });
    }
  };

  const handleConvert = async () => {
    try {
      const result = await convertToInvoice.mutateAsync(quoteId);
      toast({
        title: 'Invoice created',
        description: 'The quote has been converted to an invoice.',
      });
      setConvertDialogOpen(false);
      // Navigate to the new invoice
      if (result.data?.id) {
        router.push(`/sales/invoices/${result.data.id}`);
      }
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.response?.data?.message || 'Failed to convert quote.',
        variant: 'destructive',
      });
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10" />
          <Skeleton className="h-8 w-48" />
        </div>
        <Skeleton className="h-[200px] w-full" />
        <Skeleton className="h-[300px] w-full" />
      </div>
    );
  }

  if (!quote) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild aria-label="Go back">
            <Link href="/sales/quotes">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Quote Not Found</h1>
          </div>
        </div>
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">
              The quote you&apos;re looking for doesn&apos;t exist.
            </p>
            <Button asChild className="mt-4">
              <Link href="/sales/quotes">Back to Quotes</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const lines = quote.lines || [];
  const currency = quote.customer?.currency || 'USD';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild aria-label="Go back">
            <Link href="/sales/quotes">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight">{quote.quoteNumber}</h1>
              <QuoteStatusBadge status={quote.status} />
            </div>
            <p className="text-muted-foreground">
              {quote.customer?.displayName || quote.customer?.name}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {canEdit && quote.status === 'DRAFT' && (
            <>
              <Button variant="outline" asChild>
                <Link href={`/sales/quotes/${quoteId}/edit`}>
                  <Edit className="mr-2 h-4 w-4" />
                  Edit
                </Link>
              </Button>
              <Button onClick={handleSend}>
                <Send className="mr-2 h-4 w-4" />
                Mark as Sent
              </Button>
            </>
          )}
          {canEdit && quote.status === 'SENT' && (
            <>
              <Button variant="outline" onClick={handleDecline}>
                <Ban className="mr-2 h-4 w-4" />
                Decline
              </Button>
              <Button onClick={handleAccept}>
                <CheckCircle className="mr-2 h-4 w-4" />
                Accept
              </Button>
            </>
          )}
          {canEdit && quote.status === 'ACCEPTED' && (
            <Button onClick={() => setConvertDialogOpen(true)}>
              <FileText className="mr-2 h-4 w-4" />
              Convert to Invoice
            </Button>
          )}
          {canDelete && quote.status === 'DRAFT' && (
            <Button variant="destructive" onClick={() => setDeleteDialogOpen(true)}>
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </Button>
          )}
        </div>
      </div>

      {/* Quote Details */}
      <Card>
        <CardHeader>
          <CardTitle>Quote Details</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <dt className="text-sm font-medium text-muted-foreground">Quote Number</dt>
              <dd className="text-lg font-semibold">{quote.quoteNumber}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted-foreground">Quote Date</dt>
              <dd className="text-lg">{format(new Date(quote.date), 'MMMM d, yyyy')}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted-foreground">Expiry Date</dt>
              <dd className="text-lg">{format(new Date(quote.expiryDate), 'MMMM d, yyyy')}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted-foreground">Customer</dt>
              <dd className="text-lg">
                <Link
                  href={`/sales/customers/${quote.customerId}`}
                  className="text-blue-600 hover:underline"
                >
                  {quote.customer?.displayName || quote.customer?.name}
                </Link>
              </dd>
            </div>
            {quote.reference && (
              <div>
                <dt className="text-sm font-medium text-muted-foreground">Reference</dt>
                <dd className="text-lg">{quote.reference}</dd>
              </div>
            )}
            {quote.subject && (
              <div className="col-span-full">
                <dt className="text-sm font-medium text-muted-foreground">Subject</dt>
                <dd className="text-lg">{quote.subject}</dd>
              </div>
            )}
          </dl>
        </CardContent>
      </Card>

      {/* Line Items */}
      <Card>
        <CardHeader>
          <CardTitle>Line Items</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Rate</TableHead>
                <TableHead className="text-right">Discount</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map((line, index) => (
                <TableRow key={index}>
                  <TableCell>
                    {line.item?.name && <span className="font-medium">{line.item.name}</span>}
                    {line.description && (
                      <p className="text-sm text-muted-foreground">{line.description}</p>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-mono">{line.quantity}</TableCell>
                  <TableCell className="text-right font-mono">
                    {formatCurrency(parseFloat(line.rate), currency)}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {parseFloat(line.discountPercent || '0') > 0 ? `${line.discountPercent}%` : '-'}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatCurrency(parseFloat(line.amount), currency)}
                  </TableCell>
                </TableRow>
              ))}
              {/* Totals */}
              <TableRow className="border-t">
                <TableCell colSpan={4} className="text-right font-medium">
                  Subtotal
                </TableCell>
                <TableCell className="text-right font-mono">
                  {formatCurrency(parseFloat(quote.subtotal || '0'), currency)}
                </TableCell>
              </TableRow>
              {parseFloat(quote.discountAmount || '0') > 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-right font-medium">
                    Discount
                  </TableCell>
                  <TableCell className="text-right font-mono text-red-600">
                    -{formatCurrency(parseFloat(quote.discountAmount || '0'), currency)}
                  </TableCell>
                </TableRow>
              )}
              {parseFloat(quote.taxAmount || '0') > 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-right font-medium">
                    Tax
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatCurrency(parseFloat(quote.taxAmount), currency)}
                  </TableCell>
                </TableRow>
              )}
              <TableRow className="border-t-2 font-semibold">
                <TableCell colSpan={4} className="text-right">
                  Total
                </TableCell>
                <TableCell className="text-right font-mono text-lg">
                  {formatCurrency(parseFloat(quote.grandTotal || '0'), currency)}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Notes & Terms */}
      {(quote.notes || quote.terms) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {quote.notes && (
            <Card>
              <CardHeader>
                <CardTitle>Notes</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap">{quote.notes}</p>
              </CardContent>
            </Card>
          )}
          {quote.terms && (
            <Card>
              <CardHeader>
                <CardTitle>Terms & Conditions</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap">{quote.terms}</p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Quote</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this quote? This action cannot be undone.
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

      {/* Convert to Invoice Dialog */}
      <AlertDialog open={convertDialogOpen} onOpenChange={setConvertDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Convert to Invoice</AlertDialogTitle>
            <AlertDialogDescription>
              This will create a new invoice from this quote. The quote will be marked as invoiced.
              Do you want to proceed?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConvert}>Convert to Invoice</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
