'use client';

import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { QuoteForm } from '@/components/sales/quote-form';
import { useQuote, useUpdateQuote } from '@/lib/hooks/use-quotes';
import Link from 'next/link';

export default function EditQuotePage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const quoteId = params.id as string;

  const { data: quote, isLoading } = useQuote(quoteId);
  const updateQuote = useUpdateQuote();

  // TODO: Fetch tax rates from API
  const taxRates = [
    { id: 'vat-14', name: 'VAT 14%', rate: 14 },
    { id: 'vat-0', name: 'VAT 0%', rate: 0 },
  ];

  const handleSubmit = async (data: any) => {
    try {
      await updateQuote.mutateAsync({ id: quoteId, data });
      toast({
        title: 'Quote updated',
        description: 'The quote has been updated successfully.',
      });
      router.push(`/sales/quotes/${quoteId}`);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.response?.data?.message || 'Failed to update quote.',
        variant: 'destructive',
      });
    }
  };

  const handleCancel = () => {
    router.push(`/sales/quotes/${quoteId}`);
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10" />
          <Skeleton className="h-8 w-48" />
        </div>
        <Skeleton className="h-[400px] w-full" />
      </div>
    );
  }

  if (!quote) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/sales/quotes">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Quote Not Found</h1>
          </div>
        </div>
      </div>
    );
  }

  // Only draft quotes can be edited
  if (quote.status !== 'DRAFT') {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href={`/sales/quotes/${quoteId}`}>
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Cannot Edit Quote</h1>
          </div>
        </div>
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">
              Only draft quotes can be edited. This quote has status: {quote.status}
            </p>
            <Button asChild className="mt-4">
              <Link href={`/sales/quotes/${quoteId}`}>Back to Quote</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href={`/sales/quotes/${quoteId}`}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Edit Quote</h1>
          <p className="text-muted-foreground">
            Update {quote.quoteNumber}
          </p>
        </div>
      </div>

      {/* Form */}
      <QuoteForm
        quote={quote}
        taxRates={taxRates}
        onSubmit={handleSubmit}
        onCancel={handleCancel}
        isSubmitting={updateQuote.isPending}
      />
    </div>
  );
}
