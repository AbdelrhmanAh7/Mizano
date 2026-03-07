'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCreateAsset } from '@/lib/hooks/use-assets';
import { AssetForm } from '@/components/assets/asset-form';
import { useTranslations } from 'next-intl';

export default function NewAssetPage() {
  const router = useRouter();
  const t = useTranslations('assets');
  const createAsset = useCreateAsset();

  const handleSubmit = async (data: Record<string, unknown>) => {
    try {
      await createAsset.mutateAsync({
        ...data,
        purchasePrice: parseFloat(data.purchasePrice as string),
        salvageValue: data.salvageValue ? parseFloat(data.salvageValue as string) : 0,
        usefulLifeYears: parseInt(data.usefulLifeYears as string, 10),
      } as unknown as Parameters<typeof createAsset.mutateAsync>[0]);
      router.push('/assets');
    } catch {
      // Error handled by hook
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" aria-label="Go back" asChild>
          <Link href="/assets">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('newAssetTitle')}</h1>
          <p className="text-muted-foreground">{t('newAssetDescription')}</p>
        </div>
      </div>

      <AssetForm onSubmit={handleSubmit} isLoading={createAsset.isPending} mode="create" />
    </div>
  );
}
