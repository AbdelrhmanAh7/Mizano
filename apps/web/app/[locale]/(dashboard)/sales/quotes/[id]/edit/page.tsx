'use client';

import { useTaxRateOptions } from '@/lib/hooks/use-tax';
import { useParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
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
  const t = useTranslations('sales');
  const { toast } = useToast();
  const quoteId = params.id as string;

  const { data: quote, isLoading } = useQuote(quoteId);
  const updateQuote = useUpdateQuote();

  const taxRates = useTaxRateOptions();

  const handleSubmit = async (data: Record<string, unknown>) => {
    try {
      await updateQuote.mutateAsync({ id: quoteId, data });
      toast({
        title: t('quotes.toast.updated'),
        description: t('quotes.toast.updatedDescription'),
      });
      router.push(`/sales/quotes/${quoteId}`);
    } catch (error: unknown) {
      toast({
        title: 'Error',
        description:
          (error as { response?: { data?: { message?: string } } }).response?.data?.message ||
          t('quotes.toast.updateError'),
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
          <Button variant="ghost" size="icon" asChild aria-label={t('goBack')}>
            <Link href="/sales/quotes">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{t('quotes.quoteNotFound')}</h1>
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
          <Button variant="ghost" size="icon" asChild aria-label={t('goBack')}>
            <Link href={`/sales/quotes/${quoteId}`}>
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{t('quotes.cannotEdit')}</h1>
          </div>
        </div>
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">
              {t('quotes.cannotEditMessage', { status: quote.status })}
            </p>
            <Button asChild className="mt-4">
              <Link href={`/sales/quotes/${quoteId}`}>{t('quotes.backToQuote')}</Link>
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
        <Button variant="ghost" size="icon" asChild aria-label={t('goBack')}>
          <Link href={`/sales/quotes/${quoteId}`}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('quotes.editQuote')}</h1>
          <p className="text-muted-foreground">
            {t('quotes.updateSubtitle', { number: quote.quoteNumber })}
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
