'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ArrowLeft, Edit, Mail, Phone, MapPin, CreditCard } from 'lucide-react';
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
import { Badge } from '@/components/ui/badge';
import {
  useVendor,
  formatVendorAddress,
  formatCurrency,
  getBalanceColor,
} from '@/lib/hooks/use-vendors';
import {
  useBills,
  getStatusVariant as getBillStatusVariant,
  getStatusText as getBillStatusText,
  type Bill,
} from '@/lib/hooks/use-bills';
import { useExpenses, type Expense } from '@/lib/hooks/use-expenses';
import {
  usePaymentsMade,
  formatPaymentMode,
  type PaymentMade,
} from '@/lib/hooks/use-payments-made';
import {
  useVendorCredits,
  getStatusVariant as getCreditStatusVariant,
  getStatusText as getCreditStatusText,
  type VendorCredit,
} from '@/lib/hooks/use-vendor-credits';
import { usePermissions } from '@/lib/hooks/use-permissions';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

interface VendorDetailPageProps {
  params: { id: string };
}

export default function VendorDetailPage({ params }: VendorDetailPageProps) {
  const { id } = params;
  const t = useTranslations('purchases');
  const tCommon = useTranslations('common');
  const { hasPermission } = usePermissions();
  const { data: vendor, isLoading } = useVendor(id);
  const { data: billsData, isLoading: billsLoading } = useBills({ vendorId: id, limit: 100 });
  const { data: expensesData, isLoading: expensesLoading } = useExpenses({
    vendorId: id,
    limit: 100,
  });
  const { data: paymentsData, isLoading: paymentsLoading } = usePaymentsMade({
    vendorId: id,
    limit: 100,
  });
  const { data: creditsData, isLoading: creditsLoading } = useVendorCredits({
    vendorId: id,
    limit: 100,
  });

  const canEdit = hasPermission('purchases.edit');

  const bills = (billsData?.data ?? []) as Bill[];
  const expenses = (expensesData?.data ?? []) as Expense[];
  const payments = (paymentsData?.data ?? []) as PaymentMade[];
  const credits = (creditsData?.data ?? []) as VendorCredit[];

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
      </div>
    );
  }

  if (!vendor) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">{tCommon('errors.notFound')}</p>
        <Button asChild className="mt-4">
          <Link href="/purchases/vendors">{tCommon('buttons.back')}</Link>
        </Button>
      </div>
    );
  }

  const balance = parseFloat(vendor.outstandingBalance || '0');
  const paymentTermsLabel =
    vendor.paymentTerms === 0
      ? t('vendors.dueOnReceipt')
      : t('vendors.netDays', { days: vendor.paymentTerms });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild aria-label={t('goBack')}>
            <Link href="/purchases/vendors">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              {vendor.displayName || vendor.name}
            </h1>
            {vendor.displayName && vendor.displayName !== vendor.name && (
              <p className="text-muted-foreground">{vendor.name}</p>
            )}
          </div>
        </div>
        {canEdit && (
          <Button asChild>
            <Link href={`/purchases/vendors/${vendor.id}/edit`}>
              <Edit className="mr-2 h-4 w-4" />
              {t('vendors.editVendor')}
            </Link>
          </Button>
        )}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList>
          <TabsTrigger value="overview">{tCommon('overview')}</TabsTrigger>
          <TabsTrigger value="bills">{t('vendors.bills')}</TabsTrigger>
          <TabsTrigger value="expenses">{t('vendors.expenses')}</TabsTrigger>
          <TabsTrigger value="payments">{t('vendors.payments')}</TabsTrigger>
          <TabsTrigger value="credits">{t('vendors.credits')}</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-6">
            {/* Outstanding Balance */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {t('vendors.table.payable')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className={cn('text-2xl font-bold font-mono', getBalanceColor(balance))}>
                  {formatCurrency(balance, vendor.currency)}
                </div>
                <p className="text-xs text-muted-foreground mt-1">{t('vendors.amountOwed')}</p>
              </CardContent>
            </Card>

            {/* Payment Terms */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {t('vendors.form.paymentTerms')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{paymentTermsLabel}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {t('vendors.defaultPaymentTerms')}
                </p>
              </CardContent>
            </Card>

            {/* Currency */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {tCommon('currency')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{vendor.currency}</div>
                <p className="text-xs text-muted-foreground mt-1">{t('vendors.defaultCurrency')}</p>
              </CardContent>
            </Card>

            {/* Total Bills */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {t('vendors.totalBills')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{billsLoading ? '...' : bills.length}</div>
                <p className="text-xs text-muted-foreground mt-1">{t('vendors.billsCount')}</p>
              </CardContent>
            </Card>

            {/* Vendor Credits */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {t('vendors.vendorCredits')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{creditsLoading ? '...' : credits.length}</div>
                <p className="text-xs text-muted-foreground mt-1">{t('vendors.creditsCount')}</p>
              </CardContent>
            </Card>
          </div>

          {/* Contact & Address */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Contact Information */}
            <Card>
              <CardHeader>
                <CardTitle>{t('vendors.contactInformation')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {vendor.email && (
                  <div className="flex items-center gap-3">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <a href={`mailto:${vendor.email}`} className="text-blue-600 hover:underline">
                      {vendor.email}
                    </a>
                  </div>
                )}
                {vendor.phone && (
                  <div className="flex items-center gap-3">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <a href={`tel:${vendor.phone}`} className="text-blue-600 hover:underline">
                      {vendor.phone}
                    </a>
                  </div>
                )}
                {vendor.taxId && (
                  <div className="flex items-center gap-3">
                    <CreditCard className="h-4 w-4 text-muted-foreground" />
                    <span>
                      {t('vendors.taxIdLabel')} {vendor.taxId}
                    </span>
                  </div>
                )}
                {!vendor.email && !vendor.phone && !vendor.taxId && (
                  <p className="text-muted-foreground">{t('vendors.noContactInfo')}</p>
                )}
              </CardContent>
            </Card>

            {/* Billing Address */}
            <Card>
              <CardHeader>
                <CardTitle>{t('vendors.form.billingAddress')}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-start gap-3">
                  <MapPin className="h-4 w-4 text-muted-foreground mt-1" />
                  <div>
                    {formatVendorAddress(vendor) === '-' ? (
                      <p className="text-muted-foreground">{t('vendors.noAddress')}</p>
                    ) : (
                      <address className="not-italic">
                        {vendor.billingStreet && <p>{vendor.billingStreet}</p>}
                        {(vendor.billingCity ||
                          vendor.billingState ||
                          vendor.billingPostalCode) && (
                          <p>
                            {[vendor.billingCity, vendor.billingState, vendor.billingPostalCode]
                              .filter(Boolean)
                              .join(', ')}
                          </p>
                        )}
                        {vendor.billingCountry && <p>{vendor.billingCountry}</p>}
                      </address>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Quick Actions */}
          <Card>
            <CardHeader>
              <CardTitle>{t('vendors.quickActions')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-3">
                <Button variant="outline" asChild>
                  <Link href={`/purchases/bills/new?vendorId=${vendor.id}`}>
                    {t('vendors.createBill')}
                  </Link>
                </Button>
                <Button variant="outline" asChild>
                  <Link href={`/purchases/expenses/new?vendorId=${vendor.id}`}>
                    {t('vendors.recordExpense')}
                  </Link>
                </Button>
                <Button variant="outline" asChild>
                  <Link href={`/purchases/payments/new?vendorId=${vendor.id}`}>
                    {t('vendors.recordPayment')}
                  </Link>
                </Button>
                <Button variant="outline" asChild>
                  <Link href={`/purchases/vendor-credits/new?vendorId=${vendor.id}`}>
                    {t('vendors.createVendorCredit')}
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Bills Tab */}
        <TabsContent value="bills">
          <Card>
            <CardHeader>
              <CardTitle>{t('vendors.bills')}</CardTitle>
            </CardHeader>
            <CardContent>
              {billsLoading ? (
                <p className="text-muted-foreground">Loading...</p>
              ) : bills.length === 0 ? (
                <p className="text-muted-foreground">{t('vendors.noBillsFound')}</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('vendors.billNumber')}</TableHead>
                      <TableHead>{tCommon('date')}</TableHead>
                      <TableHead>{t('vendors.dueDate')}</TableHead>
                      <TableHead>{t('vendors.table.status')}</TableHead>
                      <TableHead className="text-right">{tCommon('amount')}</TableHead>
                      <TableHead className="text-right">{t('vendors.balance')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {bills.map((bill) => (
                      <TableRow key={bill.id}>
                        <TableCell>
                          <Link
                            href={`/purchases/bills/${bill.id}`}
                            className="text-blue-600 hover:underline"
                          >
                            {bill.billNumber}
                          </Link>
                        </TableCell>
                        <TableCell>{format(new Date(bill.date), 'MMM dd, yyyy')}</TableCell>
                        <TableCell>{format(new Date(bill.dueDate), 'MMM dd, yyyy')}</TableCell>
                        <TableCell>
                          <Badge variant={getBillStatusVariant(bill.status)}>
                            {getBillStatusText(bill.status)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {formatCurrency(bill.grandTotal, vendor.currency)}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {formatCurrency(bill.balanceDue, vendor.currency)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Expenses Tab */}
        <TabsContent value="expenses">
          <Card>
            <CardHeader>
              <CardTitle>{t('vendors.expenses')}</CardTitle>
            </CardHeader>
            <CardContent>
              {expensesLoading ? (
                <p className="text-muted-foreground">Loading...</p>
              ) : expenses.length === 0 ? (
                <p className="text-muted-foreground">{t('vendors.noExpensesFound')}</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{tCommon('date')}</TableHead>
                      <TableHead>{t('vendors.account')}</TableHead>
                      <TableHead>{tCommon('description')}</TableHead>
                      <TableHead className="text-right">{tCommon('amount')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {expenses.map((expense) => (
                      <TableRow key={expense.id}>
                        <TableCell>{format(new Date(expense.date), 'MMM dd, yyyy')}</TableCell>
                        <TableCell>{expense.account?.name ?? '-'}</TableCell>
                        <TableCell>{expense.description ?? '-'}</TableCell>
                        <TableCell className="text-right font-mono">
                          {formatCurrency(expense.amount, vendor.currency)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Payments Tab */}
        <TabsContent value="payments">
          <Card>
            <CardHeader>
              <CardTitle>{t('vendors.payments')}</CardTitle>
            </CardHeader>
            <CardContent>
              {paymentsLoading ? (
                <p className="text-muted-foreground">Loading...</p>
              ) : payments.length === 0 ? (
                <p className="text-muted-foreground">{t('vendors.noPaymentsFound')}</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('vendors.paymentNumber')}</TableHead>
                      <TableHead>{tCommon('date')}</TableHead>
                      <TableHead>{t('vendors.mode')}</TableHead>
                      <TableHead className="text-right">{tCommon('amount')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payments.map((payment) => (
                      <TableRow key={payment.id}>
                        <TableCell>
                          <Link
                            href={`/purchases/payments/${payment.id}`}
                            className="text-blue-600 hover:underline"
                          >
                            {payment.paymentNumber}
                          </Link>
                        </TableCell>
                        <TableCell>{format(new Date(payment.date), 'MMM dd, yyyy')}</TableCell>
                        <TableCell>{formatPaymentMode(payment.paymentMode)}</TableCell>
                        <TableCell className="text-right font-mono">
                          {formatCurrency(payment.amount, vendor.currency)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Credits Tab */}
        <TabsContent value="credits">
          <Card>
            <CardHeader>
              <CardTitle>{t('vendors.credits')}</CardTitle>
            </CardHeader>
            <CardContent>
              {creditsLoading ? (
                <p className="text-muted-foreground">Loading...</p>
              ) : credits.length === 0 ? (
                <p className="text-muted-foreground">{t('vendors.noCreditsFound')}</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('vendors.creditNumber')}</TableHead>
                      <TableHead>{tCommon('date')}</TableHead>
                      <TableHead>{t('credits.status')}</TableHead>
                      <TableHead className="text-right">{tCommon('amount')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {credits.map((credit) => (
                      <TableRow key={credit.id}>
                        <TableCell>
                          <Link
                            href={`/purchases/vendor-credits/${credit.id}`}
                            className="text-blue-600 hover:underline"
                          >
                            {credit.creditNumber}
                          </Link>
                        </TableCell>
                        <TableCell>{format(new Date(credit.date), 'MMM dd, yyyy')}</TableCell>
                        <TableCell>
                          {credit.status ? (
                            <Badge variant={getCreditStatusVariant(credit.status)}>
                              {getCreditStatusText(credit.status)}
                            </Badge>
                          ) : (
                            <Badge variant="secondary">-</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {formatCurrency(credit.amount, vendor.currency)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
