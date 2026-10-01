'use client';

import { useParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { InvoiceForm } from '@/components/sales/invoice-form';
import { useTaxRateOptions } from '@/lib/hooks/use-tax';
import { useInvoice, useUpdateInvoice, Invoice, InvoiceLine } from '@/lib/hooks/use-invoices';

export default function EditInvoicePage() {
  const params = useParams();
  const router = useRouter();
  const t = useTranslations('sales');
  const invoiceId = params.id as string;

  const { data: invoice, isLoading } = useInvoice(invoiceId);
  const updateInvoice = useUpdateInvoice();
  const taxRateLookup = useTaxRateOptions();

  const handleSubmit = async (formData: Record<string, unknown>) => {
    try {
      await updateInvoice.mutateAsync({
        id: invoiceId,
        data: formData as unknown as Parameters<typeof updateInvoice.mutateAsync>[0]['data'],
      });
      router.push(`/sales/invoices/${invoiceId}`);
    } catch (error) {
      // Error is handled by the mutation
    }
  };

  const handleCancel = () => {
    router.push(`/sales/invoices/${invoiceId}`);
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10" />
          <Skeleton className="h-8 w-48" />
        </div>
        <Skeleton className="h-[600px]" />
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild aria-label={t('goBack')}>
            <Link href="/sales/invoices">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{t('invoices.invoiceNotFound')}</h1>
          </div>
        </div>
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">{t('invoices.notFoundMessage')}</p>
            <Button asChild className="mt-4">
              <Link href="/sales/invoices">{t('invoices.backToInvoices')}</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (invoice.status !== 'DRAFT') {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild aria-label={t('goBack')}>
            <Link href={`/sales/invoices/${invoiceId}`}>
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{t('invoices.cannotEdit')}</h1>
          </div>
        </div>
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">{t('invoices.cannotEditMessage')}</p>
            <Button asChild className="mt-4">
              <Link href={`/sales/invoices/${invoiceId}`}>{t('invoices.viewInvoice')}</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Transform invoice data to match form expectations
  const formInvoice = {
    ...invoice,
    invoiceDate: invoice.date,
    shippingCharge: invoice.shippingAmount,
    lines: invoice.lines?.map((line: InvoiceLine & { discount?: string }) => ({
      ...line,
      discountPercent: line.discount,
    })),
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild aria-label={t('goBack')}>
          <Link href={`/sales/invoices/${invoiceId}`}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            {t('invoices.editTitle', { number: invoice.invoiceNumber })}
          </h1>
          <p className="text-muted-foreground">{t('invoices.updateDetails')}</p>
        </div>
      </div>

      {/* Form */}
      <InvoiceForm
        taxRates={taxRateLookup.options}
        taxRatesStatus={{ isLoading: taxRateLookup.isLoading, isError: taxRateLookup.isError }}
        invoice={formInvoice as Invoice}
        onSubmit={handleSubmit}
        onCancel={handleCancel}
        isSubmitting={updateInvoice.isPending}
      />
    </div>
  );
}
