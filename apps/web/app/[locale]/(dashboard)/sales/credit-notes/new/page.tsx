'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CreditNoteForm, CreditNoteFormData } from '@/components/sales/credit-note-form';
import { useCreateCreditNote } from '@/lib/hooks/use-credit-notes';

export default function NewCreditNotePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const customerId = searchParams.get('customerId') || undefined;
  const invoiceId = searchParams.get('invoiceId') || undefined;

  const createCreditNote = useCreateCreditNote();

  const handleSubmit = async (data: CreditNoteFormData) => {
    try {
      const result = await createCreditNote.mutateAsync({
        customerId: data.customerId,
        invoiceId: data.invoiceId,
        date: data.date,
        type: data.type,
        amount: data.amount,
        reason: data.reason,
        appliedToInvoiceId: data.type === 'APPLY_TO_INVOICE' ? data.appliedToInvoiceId : undefined,
      });
      router.push(`/sales/credit-notes/${result.id}`);
    } catch (error) {
      // Error is handled by the mutation
    }
  };

  const handleCancel = () => {
    router.push('/sales/credit-notes');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild aria-label="Go back">
          <Link href="/sales/credit-notes">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">New Credit Note</h1>
          <p className="text-muted-foreground">Create a credit note for a customer</p>
        </div>
      </div>

      {/* Form */}
      <CreditNoteForm
        defaultCustomerId={customerId}
        defaultInvoiceId={invoiceId}
        onSubmit={handleSubmit}
        onCancel={handleCancel}
        isSubmitting={createCreditNote.isPending}
      />
    </div>
  );
}
