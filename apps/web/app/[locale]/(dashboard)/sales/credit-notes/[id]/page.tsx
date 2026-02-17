'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, User, Calendar, FileText, DollarSign } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  useCreditNote,
  getCreditNoteTypeColor,
  getCreditNoteTypeLabel,
} from '@/lib/hooks/use-credit-notes';
import { format } from 'date-fns';

export default function CreditNoteDetailPage() {
  const params = useParams();
  const creditNoteId = params.id as string;

  const { data: creditNote, isLoading } = useCreditNote(creditNoteId);

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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
        <Skeleton className="h-[300px]" />
      </div>
    );
  }

  if (!creditNote) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild aria-label="Go back">
            <Link href="/sales/credit-notes">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Credit Note Not Found</h1>
          </div>
        </div>
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">
              The credit note you&apos;re looking for doesn&apos;t exist.
            </p>
            <Button asChild className="mt-4">
              <Link href="/sales/credit-notes">Back to Credit Notes</Link>
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
            <Link href="/sales/credit-notes">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight">{creditNote.creditNoteNumber}</h1>
              <Badge className={getCreditNoteTypeColor(creditNote.type)}>
                {getCreditNoteTypeLabel(creditNote.type)}
              </Badge>
            </div>
            {creditNote.customer && (
              <Link
                href={`/sales/customers/${creditNote.customer.id}`}
                className="text-muted-foreground hover:underline"
              >
                {creditNote.customer.name}
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <DollarSign className="h-4 w-4" />
              Credit Amount
            </div>
            <div className="text-2xl font-bold font-mono text-orange-600">
              {formatCurrency(creditNote.amount)}
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
              {format(new Date(creditNote.date), 'MMM d, yyyy')}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <FileText className="h-4 w-4" />
              Type
            </div>
            <div className="text-xl font-bold">{getCreditNoteTypeLabel(creditNote.type)}</div>
          </CardContent>
        </Card>
      </div>

      {/* Details */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Customer & Invoice Info */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Customer Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {creditNote.customer ? (
              <>
                <div>
                  <div className="text-sm text-muted-foreground">Customer Name</div>
                  <Link
                    href={`/sales/customers/${creditNote.customer.id}`}
                    className="font-medium hover:underline"
                  >
                    {creditNote.customer.name}
                  </Link>
                </div>
                {creditNote.customer.email && (
                  <div>
                    <div className="text-sm text-muted-foreground">Email</div>
                    <a
                      href={`mailto:${creditNote.customer.email}`}
                      className="text-blue-600 hover:underline"
                    >
                      {creditNote.customer.email}
                    </a>
                  </div>
                )}
              </>
            ) : (
              <p className="text-muted-foreground">No customer assigned</p>
            )}
          </CardContent>
        </Card>

        {/* Invoice Info */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Invoice Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {creditNote.invoice ? (
              <>
                <div>
                  <div className="text-sm text-muted-foreground">Original Invoice</div>
                  <Link
                    href={`/sales/invoices/${creditNote.invoice.id}`}
                    className="font-medium hover:underline"
                  >
                    {creditNote.invoice.invoiceNumber}
                  </Link>
                </div>
                {creditNote.invoice.grandTotal && (
                  <div>
                    <div className="text-sm text-muted-foreground">Invoice Total</div>
                    <div className="font-mono">{formatCurrency(creditNote.invoice.grandTotal)}</div>
                  </div>
                )}
              </>
            ) : (
              <p className="text-muted-foreground">No invoice linked</p>
            )}

            {creditNote.type === 'APPLY_TO_INVOICE' && creditNote.appliedToInvoice && (
              <div className="pt-4 border-t">
                <div className="text-sm text-muted-foreground">Applied To Invoice</div>
                <Link
                  href={`/sales/invoices/${creditNote.appliedToInvoice.id}`}
                  className="font-medium hover:underline"
                >
                  {creditNote.appliedToInvoice.invoiceNumber}
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Reason */}
      {creditNote.reason && (
        <Card>
          <CardHeader>
            <CardTitle>Reason</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap">{creditNote.reason}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
