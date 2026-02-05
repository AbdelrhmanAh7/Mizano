'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { InvoiceForm } from '@/components/sales/invoice-form';
import { useCreateInvoice } from '@/lib/hooks/use-invoices';

export default function NewInvoicePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const customerId = searchParams.get('customerId') || undefined;

  const createInvoice = useCreateInvoice();

  const handleSubmit = async (data: any) => {
    try {
      // Transform the data to match API expectations
      const invoiceData = {
        customerId: data.customerId,
        date: data.invoiceDate,
        dueDate: data.dueDate,
        shippingAmount: data.shippingCharge || '0',
        notes: data.notes,
        terms: data.terms,
        lines: data.lines.map((line: any) => ({
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
        <Button variant="ghost" size="icon" asChild>
          <Link href="/sales/invoices">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">New Invoice</h1>
          <p className="text-muted-foreground">
            Create a new invoice for a customer
          </p>
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
