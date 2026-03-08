'use client';

import { use } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ArrowLeft, Edit, Mail, Phone, MapPin, CreditCard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useVendor,
  formatVendorAddress,
  formatCurrency,
  getBalanceColor,
} from '@/lib/hooks/use-vendors';
import { usePermissions } from '@/lib/hooks/use-permissions';
import { cn } from '@/lib/utils';

interface VendorDetailPageProps {
  params: Promise<{ id: string }>;
}

export default function VendorDetailPage({ params }: VendorDetailPageProps) {
  const { id } = use(params);
  const t = useTranslations('purchases');
  const tCommon = useTranslations('common');
  const { hasPermission } = usePermissions();
  const { data: vendor, isLoading } = useVendor(id);

  const canEdit = hasPermission('purchases.edit');

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

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
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
            <p className="text-xs text-muted-foreground mt-1">{t('vendors.defaultPaymentTerms')}</p>
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
                    {(vendor.billingCity || vendor.billingState || vendor.billingPostalCode) && (
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
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
