'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Edit,
  Trash2,
  Mail,
  Phone,
  MapPin,
  FileText,
  CreditCard,
  Receipt,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
  useCustomer,
  useDeleteCustomer,
  formatCurrency,
  formatAddress,
  getBalanceColor,
} from '@/lib/hooks/use-customers';
import { useCreditNotes } from '@/lib/hooks/use-credit-notes';
import { useInvoices } from '@/lib/hooks/use-invoices';
import { usePaymentsReceived } from '@/lib/hooks/use-payments-received';
import { useQuotes } from '@/lib/hooks/use-quotes';
import { usePermissions } from '@/lib/hooks/use-permissions';
import { CustomerStatement } from '@/components/sales/customer-statement';
import { InvoiceStatusBadge, type InvoiceStatus } from '@/components/sales/status-badge';
import { useTranslations } from 'next-intl';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

export default function CustomerDetailPage() {
  const t = useTranslations('sales');
  const tCommon = useTranslations('common');
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const { hasPermission } = usePermissions();
  const customerId = params.id as string;

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const { data: customer, isLoading } = useCustomer(customerId);
  const { data: invoicesData } = useInvoices({ customerId, limit: 10 });
  const { data: paymentsData } = usePaymentsReceived({ customerId, limit: 10 });
  const { data: quotesData } = useQuotes({ customerId, limit: 10 });
  const { data: creditNotesData } = useCreditNotes({ customerId, limit: 10 });
  const deleteCustomer = useDeleteCustomer();

  const canEdit = hasPermission('sales.edit');
  const canDelete = hasPermission('sales.delete');

  const invoices = invoicesData?.data || [];
  const payments = paymentsData?.data || [];
  const quotes = quotesData?.data || [];
  const creditNotes = creditNotesData?.data || [];

  const confirmDelete = async () => {
    try {
      await deleteCustomer.mutateAsync(customerId);
      toast({
        title: t('customers.toast.deleted'),
        description: t('customers.toast.deletedDescription'),
      });
      router.push('/sales/customers');
    } catch (error: unknown) {
      toast({
        title: tCommon('error'),
        description:
          (error as { response?: { data?: { message?: string } } }).response?.data?.message ||
          t('customers.toast.deleteError'),
        variant: 'destructive',
      });
    }
    setDeleteDialogOpen(false);
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

  if (!customer) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild aria-label={t('goBack')}>
            <Link href="/sales/customers">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{t('customers.customerNotFound')}</h1>
          </div>
        </div>
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">{t('customers.notFoundMessage')}</p>
            <Button asChild className="mt-4">
              <Link href="/sales/customers">{t('customers.backToCustomers')}</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const balance = parseFloat(customer.outstandingBalance || '0');
  const billingAddress = formatAddress(customer, 'billing');
  const shippingAddress = formatAddress(customer, 'shipping');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild aria-label={t('goBack')}>
            <Link href="/sales/customers">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              {customer.displayName || customer.name}
            </h1>
            {customer.displayName && customer.displayName !== customer.name && (
              <p className="text-muted-foreground">{customer.name}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {canEdit && (
            <Button variant="outline" asChild>
              <Link href={`/sales/customers/${customerId}/edit`}>
                <Edit className="mr-2 h-4 w-4" />
                {tCommon('buttons.edit')}
              </Link>
            </Button>
          )}
          {canDelete && (
            <Button variant="destructive" onClick={() => setDeleteDialogOpen(true)}>
              <Trash2 className="mr-2 h-4 w-4" />
              {tCommon('buttons.delete')}
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">{t('customer360.overviewTab')}</TabsTrigger>
          <TabsTrigger value="invoices">{t('customer360.invoicesTab')}</TabsTrigger>
          <TabsTrigger value="payments">{t('customer360.paymentsTab')}</TabsTrigger>
          <TabsTrigger value="quotes">{t('customer360.quotesTab')}</TabsTrigger>
          <TabsTrigger value="credit-notes">{t('customer360.creditNotesTab')}</TabsTrigger>
          <TabsTrigger value="statement">{t('customer360.statementTab')}</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          {/* Quick Actions */}
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm">
              <Link href={`/sales/invoices/new?customerId=${customerId}`}>
                <Receipt className="mr-2 h-4 w-4" />
                {t('customer360.createInvoice')}
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href={`/sales/quotes/new?customerId=${customerId}`}>
                <FileText className="mr-2 h-4 w-4" />
                {t('customer360.createQuote')}
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href={`/sales/payments/new?customerId=${customerId}`}>
                <CreditCard className="mr-2 h-4 w-4" />
                {t('customer360.recordPayment')}
              </Link>
            </Button>
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="text-sm text-muted-foreground">
                  {t('customer360.outstandingBalance')}
                </div>
                <div className={cn('text-2xl font-bold font-mono', getBalanceColor(balance))}>
                  {formatCurrency(balance, customer.currency)}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="text-sm text-muted-foreground">
                  {t('customer360.totalInvoices')}
                </div>
                <div className="text-2xl font-bold">{invoices.length}</div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="text-sm text-muted-foreground">
                  {t('customer360.totalPayments')}
                </div>
                <div className="text-2xl font-bold">{payments.length}</div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="text-sm text-muted-foreground">{t('customer360.totalQuotes')}</div>
                <div className="text-2xl font-bold">{quotes.length}</div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="text-sm text-muted-foreground">
                  {t('customer360.totalCreditNotes')}
                </div>
                <div className="text-2xl font-bold">{creditNotes.length}</div>
              </CardContent>
            </Card>
          </div>

          {/* Contact Information */}
          <Card>
            <CardHeader>
              <CardTitle>{t('customers.customerDetails')}</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {customer.email && (
                  <div className="flex items-start gap-3">
                    <Mail className="h-5 w-5 text-muted-foreground mt-0.5" />
                    <div>
                      <dt className="text-sm font-medium text-muted-foreground">
                        {t('customers.form.email')}
                      </dt>
                      <dd>
                        <a
                          href={`mailto:${customer.email}`}
                          className="text-blue-600 hover:underline"
                        >
                          {customer.email}
                        </a>
                      </dd>
                    </div>
                  </div>
                )}
                {customer.phone && (
                  <div className="flex items-start gap-3">
                    <Phone className="h-5 w-5 text-muted-foreground mt-0.5" />
                    <div>
                      <dt className="text-sm font-medium text-muted-foreground">
                        {t('customers.form.phone')}
                      </dt>
                      <dd>
                        <a href={`tel:${customer.phone}`} className="hover:underline">
                          {customer.phone}
                        </a>
                      </dd>
                    </div>
                  </div>
                )}
                <div>
                  <dt className="text-sm font-medium text-muted-foreground">
                    {t('customers.form.currency')}
                  </dt>
                  <dd>{customer.currency}</dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-muted-foreground">
                    {t('customers.form.paymentTerms')}
                  </dt>
                  <dd>
                    {customer.paymentTerms
                      ? t('customer360.netDays', { days: customer.paymentTerms })
                      : t('customer360.paymentTermsNotSet')}
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          {/* Addresses */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="h-5 w-5" />
                  {t('customers.form.billingAddress')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {billingAddress ? (
                  <p className="whitespace-pre-line">{billingAddress}</p>
                ) : (
                  <p className="text-muted-foreground">{t('customer360.noBillingAddress')}</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="h-5 w-5" />
                  {t('customers.form.shippingAddress')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {shippingAddress ? (
                  <p className="whitespace-pre-line">{shippingAddress}</p>
                ) : (
                  <p className="text-muted-foreground">{t('customer360.noShippingAddress')}</p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Notes */}
          {customer.notes && (
            <Card>
              <CardHeader>
                <CardTitle>{t('customer360.notes')}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap">{customer.notes}</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Invoices Tab */}
        <TabsContent value="invoices">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                {t('customer360.recentInvoices')}
              </CardTitle>
              <Button asChild size="sm">
                <Link href={`/sales/invoices/new?customerId=${customerId}`}>
                  {t('customer360.createInvoice')}
                </Link>
              </Button>
            </CardHeader>
            <CardContent>
              {invoices.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-muted-foreground">{t('customer360.noInvoicesYet')}</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('invoices.table.invoiceNumber')}</TableHead>
                      <TableHead>{t('invoices.table.date')}</TableHead>
                      <TableHead>{t('invoices.table.dueDate')}</TableHead>
                      <TableHead>{t('invoices.table.status')}</TableHead>
                      <TableHead className="text-right">{t('invoices.table.amount')}</TableHead>
                      <TableHead className="text-right">{t('invoices.table.balance')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invoices.map(
                      (invoice: {
                        id: string;
                        invoiceNumber: string;
                        invoiceDate: string;
                        dueDate: string;
                        status: string;
                        grandTotal?: string;
                        balanceDue?: string;
                      }) => (
                        <TableRow key={invoice.id}>
                          <TableCell>
                            <Link
                              href={`/sales/invoices/${invoice.id}`}
                              className="font-medium hover:underline"
                            >
                              {invoice.invoiceNumber}
                            </Link>
                          </TableCell>
                          <TableCell>
                            {invoice.invoiceDate
                              ? format(new Date(invoice.invoiceDate), 'MMM d, yyyy')
                              : '-'}
                          </TableCell>
                          <TableCell>
                            {invoice.dueDate
                              ? format(new Date(invoice.dueDate), 'MMM d, yyyy')
                              : '-'}
                          </TableCell>
                          <TableCell>
                            <InvoiceStatusBadge status={invoice.status as InvoiceStatus} />
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {formatCurrency(
                              parseFloat(invoice.grandTotal || '0'),
                              customer.currency,
                            )}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {formatCurrency(
                              parseFloat(invoice.balanceDue || '0'),
                              customer.currency,
                            )}
                          </TableCell>
                        </TableRow>
                      ),
                    )}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Payments Tab */}
        <TabsContent value="payments">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5" />
                {t('customer360.recentPayments')}
              </CardTitle>
              <Button asChild size="sm">
                <Link href={`/sales/payments/new?customerId=${customerId}`}>
                  {t('customer360.recordPayment')}
                </Link>
              </Button>
            </CardHeader>
            <CardContent>
              {payments.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-muted-foreground">{t('customer360.noPaymentsRecorded')}</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('payments.table.paymentNumber')}</TableHead>
                      <TableHead>{t('payments.table.date')}</TableHead>
                      <TableHead>{t('payments.table.mode')}</TableHead>
                      <TableHead>{t('payments.reference')}</TableHead>
                      <TableHead className="text-right">{t('payments.table.amount')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payments.map(
                      (payment: {
                        id: string;
                        paymentNumber: string;
                        paymentDate: string;
                        paymentMode?: string;
                        reference?: string;
                        amount?: string;
                      }) => (
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
                            {payment.paymentDate
                              ? format(new Date(payment.paymentDate), 'MMM d, yyyy')
                              : '-'}
                          </TableCell>
                          <TableCell>{payment.paymentMode?.replace('_', ' ')}</TableCell>
                          <TableCell>{payment.reference || '-'}</TableCell>
                          <TableCell className="text-right font-mono text-green-600">
                            {formatCurrency(parseFloat(payment.amount || '0'), customer.currency)}
                          </TableCell>
                        </TableRow>
                      ),
                    )}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Quotes Tab */}
        <TabsContent value="quotes">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                {t('customer360.recentQuotes')}
              </CardTitle>
              <Button asChild size="sm">
                <Link href={`/sales/quotes/new?customerId=${customerId}`}>
                  {t('customer360.createQuote')}
                </Link>
              </Button>
            </CardHeader>
            <CardContent>
              {quotes.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-muted-foreground">{t('customer360.noQuotesYet')}</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('quotes.table.quoteNumber')}</TableHead>
                      <TableHead>{t('quotes.table.date')}</TableHead>
                      <TableHead>{t('quotes.table.expiryDate')}</TableHead>
                      <TableHead>{t('quotes.table.status')}</TableHead>
                      <TableHead className="text-right">{t('quotes.table.amount')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {quotes.map(
                      (quote: {
                        id: string;
                        quoteNumber: string;
                        date: string;
                        expiryDate: string;
                        status: string;
                        grandTotal?: string;
                      }) => (
                        <TableRow key={quote.id}>
                          <TableCell>
                            <Link
                              href={`/sales/quotes/${quote.id}`}
                              className="font-medium hover:underline"
                            >
                              {quote.quoteNumber}
                            </Link>
                          </TableCell>
                          <TableCell>
                            {quote.date ? format(new Date(quote.date), 'MMM d, yyyy') : '-'}
                          </TableCell>
                          <TableCell>
                            {quote.expiryDate
                              ? format(new Date(quote.expiryDate), 'MMM d, yyyy')
                              : '-'}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{quote.status}</Badge>
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {formatCurrency(parseFloat(quote.grandTotal || '0'), customer.currency)}
                          </TableCell>
                        </TableRow>
                      ),
                    )}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Credit Notes Tab */}
        <TabsContent value="credit-notes">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5" />
                {t('customer360.creditNotesTab')}
              </CardTitle>
              <Button asChild size="sm">
                <Link href={`/sales/credit-notes/new?customerId=${customerId}`}>
                  {t('customer360.createCreditNote')}
                </Link>
              </Button>
            </CardHeader>
            <CardContent>
              {creditNotes.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-muted-foreground">{t('customer360.noCreditNotesYet')}</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('creditNotes.table.creditNoteNumber')}</TableHead>
                      <TableHead>{t('creditNotes.table.date')}</TableHead>
                      <TableHead>{t('creditNotes.type')}</TableHead>
                      <TableHead className="text-right">{t('creditNotes.table.amount')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {creditNotes.map(
                      (cn: {
                        id: string;
                        creditNoteNumber: string;
                        date: string;
                        type: string;
                        amount?: string;
                      }) => (
                        <TableRow key={cn.id}>
                          <TableCell>
                            <Link
                              href={`/sales/credit-notes/${cn.id}`}
                              className="font-medium hover:underline"
                            >
                              {cn.creditNoteNumber}
                            </Link>
                          </TableCell>
                          <TableCell>
                            {cn.date ? format(new Date(cn.date), 'MMM d, yyyy') : '-'}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{cn.type.replace('_', ' ')}</Badge>
                          </TableCell>
                          <TableCell className="text-right font-mono text-orange-600">
                            {formatCurrency(parseFloat(cn.amount || '0'), customer.currency)}
                          </TableCell>
                        </TableRow>
                      ),
                    )}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Statement Tab */}
        <TabsContent value="statement">
          <CustomerStatement customerId={customerId} customer={customer} />
        </TabsContent>
      </Tabs>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('customers.deleteCustomer')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('customers.deleteConfirmDescription')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tCommon('buttons.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-red-600 hover:bg-red-700">
              {tCommon('buttons.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
