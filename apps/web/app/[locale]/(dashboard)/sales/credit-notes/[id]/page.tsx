'use client';

import { useDocumentMoney } from '@/lib/hooks/use-organization';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
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
  const t = useTranslations('sales');
  const money = useDocumentMoney();
  const creditNoteId = params.id as string;

  const { data: creditNote, isLoading } = useCreditNote(creditNoteId);

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
          <Button variant="ghost" size="icon" asChild aria-label={t('goBack')}>
            <Link href="/sales/credit-notes">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              {t('creditNotes.creditNoteNotFound')}
            </h1>
          </div>
        </div>
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">{t('creditNotes.notFoundMessage')}</p>
            <Button asChild className="mt-4">
              <Link href="/sales/credit-notes">{t('creditNotes.backToCreditNotes')}</Link>
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
              {t('creditNotes.creditAmount')}
            </div>
            <div className="text-2xl font-bold font-mono text-orange-600">
              {money(creditNote.amount)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <Calendar className="h-4 w-4" />
              {t('creditNotes.date')}
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
              {t('creditNotes.type')}
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
              {t('creditNotes.customerDetails')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {creditNote.customer ? (
              <>
                <div>
                  <div className="text-sm text-muted-foreground">
                    {t('creditNotes.customerName')}
                  </div>
                  <Link
                    href={`/sales/customers/${creditNote.customer.id}`}
                    className="font-medium hover:underline"
                  >
                    {creditNote.customer.name}
                  </Link>
                </div>
                {creditNote.customer.email && (
                  <div>
                    <div className="text-sm text-muted-foreground">{t('customers.form.email')}</div>
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
              <p className="text-muted-foreground">{t('creditNotes.noCustomerAssigned')}</p>
            )}
          </CardContent>
        </Card>

        {/* Invoice Info */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              {t('creditNotes.invoiceDetails')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {creditNote.invoice ? (
              <>
                <div>
                  <div className="text-sm text-muted-foreground">
                    {t('creditNotes.originalInvoice')}
                  </div>
                  <Link
                    href={`/sales/invoices/${creditNote.invoice.id}`}
                    className="font-medium hover:underline"
                  >
                    {creditNote.invoice.invoiceNumber}
                  </Link>
                </div>
                {creditNote.invoice.grandTotal && (
                  <div>
                    <div className="text-sm text-muted-foreground">
                      {t('creditNotes.invoiceTotal')}
                    </div>
                    <div className="font-mono">{money(creditNote.invoice.grandTotal)}</div>
                  </div>
                )}
              </>
            ) : (
              <p className="text-muted-foreground">{t('creditNotes.noInvoiceLinked')}</p>
            )}

            {creditNote.type === 'APPLY_TO_INVOICE' && creditNote.appliedToInvoice && (
              <div className="pt-4 border-t">
                <div className="text-sm text-muted-foreground">
                  {t('creditNotes.appliedToInvoice')}
                </div>
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
            <CardTitle>{t('creditNotes.reason')}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap">{creditNote.reason}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
