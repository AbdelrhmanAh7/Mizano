'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PaymentReceivedForm, PaymentReceivedFormData } from '@/components/sales/payment-received-form';
import { useCreatePaymentReceived } from '@/lib/hooks/use-payments-received';

export default function NewPaymentReceivedPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const customerId = searchParams.get('customerId') || undefined;
  const invoiceId = searchParams.get('invoiceId') || undefined;

  const createPayment = useCreatePaymentReceived();

  const handleSubmit = async (data: PaymentReceivedFormData) => {
    try {
      const result = await createPayment.mutateAsync({
        customerId: data.customerId,
        date: data.date,
        amount: data.amount,
        paymentMode: data.paymentMode,
        depositToAccountId: data.depositToAccountId,
        reference: data.reference,
        notes: data.notes,
        allocations: data.allocations
          .filter((a) => a.selected && parseFloat(a.amount) > 0)
          .map((a) => ({ invoiceId: a.invoiceId, amount: a.amount })),
      });
      router.push(`/sales/payments/${result.id}`);
    } catch (error) {
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
        <Button variant="ghost" size="icon" asChild>
          <Link href="/sales/payments">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Record Payment</h1>
          <p className="text-muted-foreground">
            Record a payment received from a customer
          </p>
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
