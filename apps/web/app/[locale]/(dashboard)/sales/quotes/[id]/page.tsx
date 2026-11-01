'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
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
import { DeleteConfirmDialog } from '@/components/shared/delete-confirm-dialog';
import { DocumentPdfActions } from '@/components/shared/document-pdf-actions';
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
import { useMoneyFormatter } from '@/lib/hooks/use-money-formatter';
import { useDateFormatter } from '@/lib/hooks/use-date-locale';

export default function QuoteDetailPage() {
  const formatLongDate = useDateFormatter('long');
  // Quote amounts: see `currency` below.
  const formatCurrency = useMoneyFormatter();
  const params = useParams();
  const router = useRouter();
  const t = useTranslations('sales');
  const tCommon = useTranslations('common');
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
  // Same permission as GET /documents/quote/:id/pdf.
  const canExportPdf = hasPermission('sales.view');

  const confirmDelete = async () => {
    try {
      await deleteQuote.mutateAsync(quoteId);
      toast({
        title: t('quotes.toast.deleted'),
        description: t('quotes.toast.deletedDescription'),
      });
      router.push('/sales/quotes');
    } catch (error: unknown) {
      toast({
        title: tCommon('errors.title'),
        description:
          (error as { response?: { data?: { message?: string } } }).response?.data?.message ||
          t('quotes.toast.deleteError'),
        variant: 'destructive',
      });
    }
    setDeleteDialogOpen(false);
  };

  const handleSend = async () => {
    try {
      await sendQuote.mutateAsync(quoteId);
      toast({
        title: t('quotes.toast.sent'),
        description: t('quotes.toast.sentDescription'),
      });
    } catch (error: unknown) {
      toast({
        title: tCommon('errors.title'),
        description:
          (error as { response?: { data?: { message?: string } } }).response?.data?.message ||
          t('quotes.toast.sendError'),
        variant: 'destructive',
      });
    }
  };

  const handleAccept = async () => {
    try {
      await acceptQuote.mutateAsync(quoteId);
      toast({
        title: t('quotes.toast.accepted'),
        description: t('quotes.toast.acceptedDescription'),
      });
    } catch (error: unknown) {
      toast({
        title: tCommon('errors.title'),
        description:
          (error as { response?: { data?: { message?: string } } }).response?.data?.message ||
          t('quotes.toast.acceptError'),
        variant: 'destructive',
      });
    }
  };

  const handleDecline = async () => {
    try {
      await declineQuote.mutateAsync(quoteId);
      toast({
        title: t('quotes.toast.declined'),
        description: t('quotes.toast.declinedDescription'),
      });
    } catch (error: unknown) {
      toast({
        title: tCommon('errors.title'),
        description:
          (error as { response?: { data?: { message?: string } } }).response?.data?.message ||
          t('quotes.toast.declineError'),
        variant: 'destructive',
      });
    }
  };

  const handleConvert = async () => {
    try {
      const result = await convertToInvoice.mutateAsync(quoteId);
      toast({
        title: t('quotes.toast.invoiceCreated'),
        description: t('quotes.toast.invoiceCreatedDescription'),
      });
      setConvertDialogOpen(false);
      // The hook already returns the response body: the new invoice itself (#667).
      if (result?.id) {
        router.push(`/sales/invoices/${result.id}`);
      }
    } catch (error: unknown) {
      toast({
        title: tCommon('errors.title'),
        description:
          (error as { response?: { data?: { message?: string } } }).response?.data?.message ||
          t('quotes.toast.convertError'),
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
          <Button variant="ghost" size="icon" asChild aria-label={t('goBack')}>
            <Link href="/sales/quotes">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{t('quotes.quoteNotFound')}</h1>
          </div>
        </div>
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">{t('quotes.notFoundMessage')}</p>
            <Button asChild className="mt-4">
              <Link href="/sales/quotes">{t('quotes.backToQuotes')}</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const lines = quote.lines || [];
  // The quote's own currency, else the org base currency; never the customer's (audit B5).
  const currency = quote.currencyCode;
  const invoice = quote.invoices?.[0];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild aria-label={t('goBack')}>
            <Link href="/sales/quotes">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 dir="ltr" className="text-3xl font-bold tracking-tight whitespace-nowrap">
                {quote.quoteNumber}
              </h1>
              <QuoteStatusBadge status={quote.status} />
            </div>
            <p className="text-muted-foreground">
              {quote.customer?.displayName || quote.customer?.name}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canExportPdf && (
            <DocumentPdfActions
              kind="quote"
              documentId={quoteId}
              documentNumber={quote.quoteNumber}
            />
          )}
          {canEdit && quote.status === 'DRAFT' && (
            <>
              <Button variant="outline" asChild>
                <Link href={`/sales/quotes/${quoteId}/edit`}>
                  <Edit className="mr-2 h-4 w-4" />
                  {t('quotes.editQuote')}
                </Link>
              </Button>
              <Button onClick={handleSend}>
                <Send className="mr-2 h-4 w-4" />
                {t('quotes.markAsSent')}
              </Button>
            </>
          )}
          {canEdit && quote.status === 'SENT' && (
            <>
              <Button variant="outline" onClick={handleDecline}>
                <Ban className="mr-2 h-4 w-4" />
                {t('quotes.decline')}
              </Button>
              <Button onClick={handleAccept}>
                <CheckCircle className="mr-2 h-4 w-4" />
                {t('quotes.accept')}
              </Button>
            </>
          )}
          {canEdit && quote.status === 'ACCEPTED' && (
            <Button onClick={() => setConvertDialogOpen(true)}>
              <FileText className="mr-2 h-4 w-4" />
              {t('quotes.convertToInvoice')}
            </Button>
          )}
          {quote.status === 'INVOICED' && invoice && (
            <Button asChild>
              <Link href={`/sales/invoices/${invoice.id}`}>
                <FileText className="mr-2 h-4 w-4" />
                {t('quotes.openInvoice', { number: invoice.invoiceNumber })}
              </Link>
            </Button>
          )}
          {canDelete && quote.status === 'DRAFT' && (
            <Button variant="destructive" onClick={() => setDeleteDialogOpen(true)}>
              <Trash2 className="mr-2 h-4 w-4" />
              {tCommon('buttons.delete')}
            </Button>
          )}
        </div>
      </div>

      {/* Quote Details */}
      <Card>
        <CardHeader>
          <CardTitle>{t('quotes.quoteDetails')}</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <dt className="text-sm font-medium text-muted-foreground">
                {t('quotes.quoteNumber')}
              </dt>
              <dd className="text-lg font-semibold">{quote.quoteNumber}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted-foreground">{t('quotes.quoteDate')}</dt>
              <dd className="text-lg">{formatLongDate(new Date(quote.date))}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted-foreground">
                {t('quotes.expiryDate')}
              </dt>
              <dd className="text-lg">{formatLongDate(new Date(quote.expiryDate))}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted-foreground">{t('quotes.customer')}</dt>
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
                <dt className="text-sm font-medium text-muted-foreground">
                  {t('quotes.reference')}
                </dt>
                <dd className="text-lg">{quote.reference}</dd>
              </div>
            )}
            {quote.subject && (
              <div className="col-span-full">
                <dt className="text-sm font-medium text-muted-foreground">{t('quotes.subject')}</dt>
                <dd className="text-lg">{quote.subject}</dd>
              </div>
            )}
          </dl>
        </CardContent>
      </Card>

      {/* Line Items */}
      <Card>
        <CardHeader>
          <CardTitle>{t('lineItems.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('quotes.table.description')}</TableHead>
                <TableHead className="text-right">{t('quotes.table.qty')}</TableHead>
                <TableHead className="text-right">{t('quotes.table.rate')}</TableHead>
                <TableHead className="text-right">{t('quotes.table.discount')}</TableHead>
                <TableHead className="text-right">{t('quotes.table.amount')}</TableHead>
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
                  {t('quotes.table.subtotal')}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {formatCurrency(parseFloat(quote.subtotal || '0'), currency)}
                </TableCell>
              </TableRow>
              {parseFloat(quote.discountAmount || '0') > 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-right font-medium">
                    {t('quotes.table.discount')}
                  </TableCell>
                  <TableCell className="text-right font-mono text-red-600">
                    -{formatCurrency(parseFloat(quote.discountAmount || '0'), currency)}
                  </TableCell>
                </TableRow>
              )}
              {parseFloat(quote.taxAmount || '0') > 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-right font-medium">
                    {t('quotes.table.tax')}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatCurrency(parseFloat(quote.taxAmount), currency)}
                  </TableCell>
                </TableRow>
              )}
              <TableRow className="border-t-2 font-semibold">
                <TableCell colSpan={4} className="text-right">
                  {t('quotes.table.total')}
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
                <CardTitle>{t('quotes.form.notes')}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap">{quote.notes}</p>
              </CardContent>
            </Card>
          )}
          {quote.terms && (
            <Card>
              <CardHeader>
                <CardTitle>{t('quotes.form.terms')}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap">{quote.terms}</p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title={t('quotes.deleteQuote')}
        description={t('quotes.deleteConfirmation')}
        onConfirm={confirmDelete}
      />

      {/* Convert to Invoice Dialog */}
      <AlertDialog open={convertDialogOpen} onOpenChange={setConvertDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('quotes.convertToInvoice')}</AlertDialogTitle>
            <AlertDialogDescription>{t('quotes.convertDescription')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tCommon('buttons.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleConvert}>
              {t('quotes.convertToInvoice')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
