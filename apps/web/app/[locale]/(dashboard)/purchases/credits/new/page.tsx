'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { VendorCreditForm } from '@/components/purchases/vendor-credit-form';
import { useCreateVendorCredit } from '@/lib/hooks/use-vendor-credits';

export default function NewVendorCreditPage() {
  const router = useRouter();
  const t = useTranslations('purchases');
  const searchParams = useSearchParams();
  const createCredit = useCreateVendorCredit();

  // Get preselected vendor from query params
  const preselectedVendorId = searchParams.get('vendorId') || undefined;

  const handleSubmit = async (
    data: Parameters<typeof createCredit.mutateAsync>[0],
  ): Promise<void> => {
    try {
      await createCredit.mutateAsync(data);
      router.push('/purchases/credits');
    } catch {
      // Error is surfaced by the mutation's toast.
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild aria-label={t('goBack')}>
          <Link href="/purchases/credits">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('credits.newCredit')}</h1>
          <p className="text-muted-foreground">{t('credits.newDescription')}</p>
        </div>
      </div>

      {/* The vendor picker searches the server itself, so the form needs no preloaded list. */}
      <VendorCreditForm
        onSubmit={(data) => void handleSubmit(data)}
        onCancel={() => router.push('/purchases/credits')}
        isSubmitting={createCredit.isPending}
        preselectedVendorId={preselectedVendorId}
      />
    </div>
  );
}
