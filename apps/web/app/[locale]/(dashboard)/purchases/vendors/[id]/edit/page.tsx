'use client';

import { use } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { VendorForm } from '@/components/purchases/vendor-form';
import { useVendor, useUpdateVendor } from '@/lib/hooks/use-vendors';

interface EditVendorPageProps {
  params: Promise<{ id: string }>;
}

export default function EditVendorPage({ params }: EditVendorPageProps) {
  const { id } = use(params);
  const router = useRouter();
  const t = useTranslations('purchases');
  const tCommon = useTranslations('common');
  const { data: vendor, isLoading } = useVendor(id);
  const updateVendor = useUpdateVendor();

  const handleSubmit = async (data: Record<string, unknown>) => {
    try {
      await updateVendor.mutateAsync({ id, data });
      router.push(`/purchases/vendors/${id}`);
    } catch (error) {
      // Error is handled in the hook
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (!vendor) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">{tCommon('errors.notFound')}</p>
        <Button asChild className="mt-4">
          <Link href="/purchases/vendors">{tCommon('buttons.back')}</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild aria-label="Go back">
          <Link href={`/purchases/vendors/${id}`}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('vendors.editVendor')}</h1>
          <p className="text-muted-foreground">{vendor.name}</p>
        </div>
      </div>

      {/* Form */}
      <VendorForm
        vendor={vendor}
        onSubmit={handleSubmit}
        onCancel={() => router.push(`/purchases/vendors/${id}`)}
        isSubmitting={updateVendor.isPending}
      />
    </div>
  );
}
