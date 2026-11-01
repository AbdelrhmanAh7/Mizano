'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PaymentReceivedForm } from '@/components/sales/payment-received-form';
import {
  useCreatePaymentReceived,
  type CreatePaymentReceivedData,
} from '@/lib/hooks/use-payments-received';
import { newIdempotencyKey } from '@/lib/utils/idempotency';

export default function NewPaymentReceivedPage() {
  const router = useRouter();
  const t = useTranslations('sales');
  const searchParams = useSearchParams();
  const customerId = searchParams.get('customerId') || undefined;
  const invoiceId = searchParams.get('invoiceId') || undefined;

  const createPayment = useCreatePaymentReceived();
  // One key for this screen: a double click or a retry after an error is recorded only once.
  const [idempotencyKey] = useState(newIdempotencyKey);

  // The form sends the API payload (ticked invoices only); pass it through unchanged.
  const handleSubmit = async (payload: CreatePaymentReceivedData) => {
    try {
      const result = await createPayment.mutateAsync({ ...payload, idempotencyKey });
      router.push(`/sales/payments/${result.id}`);
    } catch {
      // Error is handled by the mutation
    }
  };

  const handleCancel = () => {
    if (invoiceId) {
      router.push(`/sales/invoices/${invoiceId}`);
    } else {
      router.push('/sales/payments');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild aria-label={t('goBack')}>
          <Link href="/sales/payments">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('payments.recordPayment')}</h1>
          <p className="text-muted-foreground">{t('payments.recordDescription')}</p>
        </div>
      </div>

      {/* Form */}
      <PaymentReceivedForm
        defaultCustomerId={customerId}
        defaultInvoiceId={invoiceId}
        onSubmit={handleSubmit}
        onCancel={handleCancel}
        isSubmitting={createPayment.isPending}
      />
    </div>
  );
}
