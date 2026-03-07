'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { VendorForm } from '@/components/purchases/vendor-form';
import { useCreateVendor } from '@/lib/hooks/use-vendors';

export default function NewVendorPage() {
  const router = useRouter();
  const t = useTranslations('purchases');
  const createVendor = useCreateVendor();

  const handleSubmit = async (data: Record<string, unknown>) => {
    try {
      await createVendor.mutateAsync(data);
      router.push('/purchases/vendors');
    } catch (error) {
      // Error is handled in the hook
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild aria-label="Go back">
          <Link href="/purchases/vendors">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('vendors.newVendor')}</h1>
          <p className="text-muted-foreground">{t('vendors.empty.description')}</p>
        </div>
      </div>

      {/* Form */}
      <VendorForm
        onSubmit={handleSubmit}
        onCancel={() => router.push('/purchases/vendors')}
        isSubmitting={createVendor.isPending}
      />
    </div>
  );
}
