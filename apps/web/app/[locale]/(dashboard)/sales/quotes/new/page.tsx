'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { QuoteForm } from '@/components/sales/quote-form';
import { useCreateQuote } from '@/lib/hooks/use-quotes';
import Link from 'next/link';

export default function NewQuotePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();

  const customerId = searchParams.get('customerId') || undefined;
  const createQuote = useCreateQuote();

  // TODO: Fetch tax rates from API
  const taxRates = [
    { id: 'vat-14', name: 'VAT 14%', rate: 14 },
    { id: 'vat-0', name: 'VAT 0%', rate: 0 },
  ];

  const handleSubmit = async (data: Record<string, unknown>) => {
    try {
      const result = await createQuote.mutateAsync(data);
      toast({
        title: 'Quote created',
        description: 'The quote has been created successfully.',
      });
      router.push(`/sales/quotes/${result.data?.id || ''}`);
    } catch (error: unknown) {
      toast({
        title: 'Error',
        description:
          (error as { response?: { data?: { message?: string } } }).response?.data?.message ||
          'Failed to create quote.',
        variant: 'destructive',
      });
    }
  };

  const handleCancel = () => {
    router.push('/sales/quotes');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild aria-label="Go back">
          <Link href="/sales/quotes">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">New Quote</h1>
          <p className="text-muted-foreground">Create a new estimate for your customer</p>
        </div>
      </div>

      {/* Form */}
      <QuoteForm
        customerId={customerId}
        taxRates={taxRates}
        onSubmit={handleSubmit}
        onCancel={handleCancel}
        isSubmitting={createQuote.isPending}
      />
    </div>
  );
}
