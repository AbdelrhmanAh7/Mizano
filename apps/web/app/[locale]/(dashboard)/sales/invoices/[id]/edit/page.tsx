'use client';

import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { InvoiceForm } from '@/components/sales/invoice-form';
import { useInvoice, useUpdateInvoice, Invoice, InvoiceLine } from '@/lib/hooks/use-invoices';

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

export default function EditInvoicePage() {
  const params = useParams();
  const router = useRouter();
  const invoiceId = params.id as string;

  const { data: invoice, isLoading } = useInvoice(invoiceId);
  const updateInvoice = useUpdateInvoice();

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
          taxRate: line.taxRateId ? '0' : '0',
        })),
      };

      await updateInvoice.mutateAsync({ id: invoiceId, data: invoiceData });
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
          <Button variant="ghost" size="icon" asChild aria-label="Go back">
            <Link href="/sales/invoices">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Invoice Not Found</h1>
          </div>
        </div>
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">
              The invoice you&apos;re looking for doesn&apos;t exist.
            </p>
            <Button asChild className="mt-4">
              <Link href="/sales/invoices">Back to Invoices</Link>
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
          <Button variant="ghost" size="icon" asChild aria-label="Go back">
            <Link href={`/sales/invoices/${invoiceId}`}>
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Cannot Edit Invoice</h1>
          </div>
        </div>
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">
              Only draft invoices can be edited. This invoice has already been sent.
            </p>
            <Button asChild className="mt-4">
              <Link href={`/sales/invoices/${invoiceId}`}>View Invoice</Link>
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
        <Button variant="ghost" size="icon" asChild aria-label="Go back">
          <Link href={`/sales/invoices/${invoiceId}`}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Edit Invoice {invoice.invoiceNumber}
          </h1>
          <p className="text-muted-foreground">Update invoice details</p>
        </div>
      </div>

      {/* Form */}
      <InvoiceForm
        invoice={formInvoice as Invoice}
        onSubmit={handleSubmit}
        onCancel={handleCancel}
        isSubmitting={updateInvoice.isPending}
      />
    </div>
  );
}
