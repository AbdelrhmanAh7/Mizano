'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { InvoiceForm } from '@/components/sales/invoice-form';
import { useTaxRateOptions } from '@/lib/hooks/use-tax';
import { useCreateInvoice } from '@/lib/hooks/use-invoices';

export default function NewInvoicePage() {
  const router = useRouter();
  const t = useTranslations('sales');
  const searchParams = useSearchParams();
  const customerId = searchParams.get('customerId') || undefined;

  const createInvoice = useCreateInvoice();
  const taxRateLookup = useTaxRateOptions();

  const handleSubmit = async (formData: Record<string, unknown>) => {
    try {
      const result = await createInvoice.mutateAsync(
        formData as unknown as Parameters<typeof createInvoice.mutateAsync>[0],
      );
      router.push(`/sales/invoices/${result.id}`);
    } catch (error) {
      // Error is handled by the mutation
    }
  };

  const handleCancel = () => {
    router.push('/sales/invoices');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild aria-label={t('goBack')}>
          <Link href="/sales/invoices">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('invoices.newInvoice')}</h1>
          <p className="text-muted-foreground">{t('invoices.newDescription')}</p>
        </div>
      </div>

      {/* Form */}
      <InvoiceForm
        taxRates={taxRateLookup.options}
        taxRatesStatus={{ isLoading: taxRateLookup.isLoading, isError: taxRateLookup.isError }}
        customerId={customerId}
        onSubmit={handleSubmit}
        onCancel={handleCancel}
        isSubmitting={createInvoice.isPending}
      />
    </div>
  );
}
