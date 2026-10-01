'use client';

import { useTaxRateOptions } from '@/lib/hooks/use-tax';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { QuoteForm } from '@/components/sales/quote-form';
import { useCreateQuote } from '@/lib/hooks/use-quotes';
import Link from 'next/link';

export default function NewQuotePage() {
  const router = useRouter();
  const t = useTranslations('sales');
  const searchParams = useSearchParams();
  const { toast } = useToast();

  const customerId = searchParams.get('customerId') || undefined;
  const createQuote = useCreateQuote();

  const taxRateLookup = useTaxRateOptions();

  const handleSubmit = async (data: Record<string, unknown>) => {
    try {
      const result = await createQuote.mutateAsync(
        data as unknown as Parameters<typeof createQuote.mutateAsync>[0],
      );
      toast({
        title: t('quotes.toast.created'),
        description: t('quotes.toast.createdDescription'),
      });
      router.push(`/sales/quotes/${result.data?.id || ''}`);
    } catch (error: unknown) {
      toast({
        title: 'Error',
        description:
          (error as { response?: { data?: { message?: string } } }).response?.data?.message ||
          t('quotes.toast.createError'),
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
        <Button variant="ghost" size="icon" asChild aria-label={t('goBack')}>
          <Link href="/sales/quotes">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('quotes.newQuote')}</h1>
          <p className="text-muted-foreground">{t('quotes.newDescription')}</p>
        </div>
      </div>

      {/* Form */}
      <QuoteForm
        customerId={customerId}
        taxRates={taxRateLookup.options}
        taxRatesStatus={{ isLoading: taxRateLookup.isLoading, isError: taxRateLookup.isError }}
        onSubmit={handleSubmit}
        onCancel={handleCancel}
        isSubmitting={createQuote.isPending}
      />
    </div>
  );
}
