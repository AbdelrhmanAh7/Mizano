'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { VendorCreditForm } from '@/components/purchases/vendor-credit-form';
import { useCreateVendorCredit } from '@/lib/hooks/use-vendor-credits';
import { useVendors } from '@/lib/hooks/use-vendors';
import { useQuery } from '@tanstack/react-query';
import { accountsApi, itemsApi } from '@/lib/api';

export default function NewVendorCreditPage() {
  const router = useRouter();
  const t = useTranslations('purchases');
  const searchParams = useSearchParams();
  const createCredit = useCreateVendorCredit();

  // Get preselected vendor from query params
  const preselectedVendorId = searchParams.get('vendorId') || undefined;

  // Fetch vendors
  const { data: vendorsData, isLoading: vendorsLoading } = useVendors();

  // Fetch accounts
  const { data: accountsData, isLoading: accountsLoading } = useQuery({
    queryKey: ['accounts'],
    queryFn: async () => {
      const response = await accountsApi.getAll();
      return response.data;
    },
  });

  // Fetch items
  const { data: itemsData, isLoading: itemsLoading } = useQuery({
    queryKey: ['items'],
    queryFn: async () => {
      const response = await itemsApi.getAll();
      return response.data;
    },
  });

  const vendors = vendorsData?.data || [];
  const accounts = accountsData?.data || [];
  const items = itemsData?.data || [];

  const handleSubmit = async (data: Record<string, unknown>) => {
    try {
      await createCredit.mutateAsync(
        data as unknown as Parameters<typeof createCredit.mutateAsync>[0],
      );
      router.push('/purchases/credits');
    } catch (error) {
      // Error is handled in the hook
    }
  };

  if (vendorsLoading || accountsLoading || itemsLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
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

      {/* Form */}
      <VendorCreditForm
        vendors={vendors}
        accounts={accounts}
        items={items}
        onSubmit={handleSubmit}
        onCancel={() => router.push('/purchases/credits')}
        isSubmitting={createCredit.isPending}
        preselectedVendorId={preselectedVendorId}
      />
    </div>
  );
}
