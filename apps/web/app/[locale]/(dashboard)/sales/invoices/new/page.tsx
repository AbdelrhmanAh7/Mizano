'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { InvoiceForm } from '@/components/sales/invoice-form';
import { useCreateInvoice } from '@/lib/hooks/use-invoices';

interface InvoiceSubmitData {
  customerId: string;
  invoiceDate: string;
  dueDate: string;
  shippingCharge?: string;
  notes?: string;
  terms?: string;
  lines: Array<{
    itemId?: string;
    description: string;
    quantity: string;
    rate: string;
    discountPercent?: string;
    taxRateId?: string;
  }>;
}

export default function NewInvoicePage() {
  const router = useRouter();
  const t = useTranslations('sales');
  const searchParams = useSearchParams();
  const customerId = searchParams.get('customerId') || undefined;

  const createInvoice = useCreateInvoice();

  const handleSubmit = async (data: InvoiceSubmitData) => {
    try {
      // Transform the data to match API expectations
      const invoiceData = {
        customerId: data.customerId,
        date: data.invoiceDate,
        dueDate: data.dueDate,
        shippingAmount: data.shippingCharge || '0',
        notes: data.notes,
        terms: data.terms,
        lines: (data.lines ?? []).map((line: InvoiceSubmitData['lines'][number]) => ({
          itemId: line.itemId || undefined,
          description: line.description,
          quantity: line.quantity,
          rate: line.rate,
          discount: line.discountPercent || '0',
          taxRate: line.taxRateId ? '0' : '0', // We'll handle tax differently if needed
        })),
      };

      const result = await createInvoice.mutateAsync(invoiceData);
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
        customerId={customerId}
        onSubmit={handleSubmit}
        onCancel={handleCancel}
        isSubmitting={createInvoice.isPending}
      />
    </div>
  );
}
