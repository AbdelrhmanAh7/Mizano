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
  Receipt,
  CreditCard,
} from 'lucide-react';
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
import { useInvoices } from '@/lib/hooks/use-invoices';
import { usePaymentsReceived } from '@/lib/hooks/use-payments-received';
import { usePermissions } from '@/lib/hooks/use-permissions';
import { CustomerStatement } from '@/components/sales/customer-statement';
import { InvoiceStatusBadge } from '@/components/sales/status-badge';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

export default function CustomerDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const { hasPermission } = usePermissions();
  const customerId = params.id as string;

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const { data: customer, isLoading } = useCustomer(customerId);
  const { data: invoicesData } = useInvoices({ customerId, limit: 10 });
  const { data: paymentsData } = usePaymentsReceived({ customerId, limit: 10 });
  const deleteCustomer = useDeleteCustomer();

  const canEdit = hasPermission('sales.edit');
  const canDelete = hasPermission('sales.delete');

  const invoices = invoicesData?.data || [];
  const payments = paymentsData?.data || [];

  const confirmDelete = async () => {
    try {
      await deleteCustomer.mutateAsync(customerId);
      toast({
        title: 'Customer deleted',
        description: 'The customer has been deleted.',
      });
      router.push('/sales/customers');
    } catch (error: unknown) {
      toast({
        title: 'Error',
        description:
          (error as { response?: { data?: { message?: string } } }).response?.data?.message ||
          'Failed to delete customer. They may have associated transactions.',
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
          <Button variant="ghost" size="icon" asChild aria-label="Go back">
            <Link href="/sales/customers">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Customer Not Found</h1>
          </div>
        </div>
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">
              The customer you&apos;re looking for doesn&apos;t exist.
            </p>
            <Button asChild className="mt-4">
              <Link href="/sales/customers">Back to Customers</Link>
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
          <Button variant="ghost" size="icon" asChild aria-label="Go back">
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
                Edit
              </Link>
            </Button>
          )}
          {canDelete && (
            <Button variant="destructive" onClick={() => setDeleteDialogOpen(true)}>
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="invoices">Invoices</TabsTrigger>
          <TabsTrigger value="payments">Payments</TabsTrigger>
          <TabsTrigger value="statement">Statement</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="text-sm text-muted-foreground">Outstanding Balance</div>
                <div className={cn('text-2xl font-bold font-mono', getBalanceColor(balance))}>
                  {formatCurrency(balance, customer.currency)}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="text-sm text-muted-foreground">Total Invoices</div>
                <div className="text-2xl font-bold">{invoices.length}</div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="text-sm text-muted-foreground">Total Payments</div>
                <div className="text-2xl font-bold">{payments.length}</div>
              </CardContent>
            </Card>
          </div>

          {/* Contact Information */}
          <Card>
            <CardHeader>
              <CardTitle>Contact Information</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {customer.email && (
                  <div className="flex items-start gap-3">
                    <Mail className="h-5 w-5 text-muted-foreground mt-0.5" />
                    <div>
                      <dt className="text-sm font-medium text-muted-foreground">Email</dt>
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
                      <dt className="text-sm font-medium text-muted-foreground">Phone</dt>
                      <dd>
                        <a href={`tel:${customer.phone}`} className="hover:underline">
                          {customer.phone}
                        </a>
                      </dd>
                    </div>
                  </div>
                )}
                <div>
                  <dt className="text-sm font-medium text-muted-foreground">Currency</dt>
                  <dd>{customer.currency}</dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-muted-foreground">Payment Terms</dt>
                  <dd>{customer.paymentTerms ? `Net ${customer.paymentTerms} days` : 'Not set'}</dd>
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
                  Billing Address
                </CardTitle>
              </CardHeader>
              <CardContent>
                {billingAddress ? (
                  <p className="whitespace-pre-line">{billingAddress}</p>
                ) : (
                  <p className="text-muted-foreground">No billing address</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="h-5 w-5" />
                  Shipping Address
                </CardTitle>
              </CardHeader>
              <CardContent>
                {shippingAddress ? (
                  <p className="whitespace-pre-line">{shippingAddress}</p>
                ) : (
                  <p className="text-muted-foreground">No shipping address</p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Notes */}
          {customer.notes && (
            <Card>
              <CardHeader>
                <CardTitle>Notes</CardTitle>
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
                Recent Invoices
              </CardTitle>
              <Button asChild size="sm">
                <Link href={`/sales/invoices/new?customerId=${customerId}`}>Create Invoice</Link>
              </Button>
            </CardHeader>
            <CardContent>
              {invoices.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-muted-foreground">No invoices yet</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Invoice #</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Due Date</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead className="text-right">Balance</TableHead>
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
                            {format(new Date(invoice.invoiceDate), 'MMM d, yyyy')}
                          </TableCell>
                          <TableCell>{format(new Date(invoice.dueDate), 'MMM d, yyyy')}</TableCell>
                          <TableCell>
                            <InvoiceStatusBadge status={invoice.status} />
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
                Recent Payments
              </CardTitle>
              <Button asChild size="sm">
                <Link href={`/sales/payments/new?customerId=${customerId}`}>Record Payment</Link>
              </Button>
            </CardHeader>
            <CardContent>
              {payments.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-muted-foreground">No payments recorded</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Payment #</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Mode</TableHead>
                      <TableHead>Reference</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
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
                            {format(new Date(payment.paymentDate), 'MMM d, yyyy')}
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

        {/* Statement Tab */}
        <TabsContent value="statement">
          <CustomerStatement customerId={customerId} customer={customer} />
        </TabsContent>
      </Tabs>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Customer</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this customer? This action cannot be undone.
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
    </div>
  );
}
