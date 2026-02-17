'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCreateAsset } from '@/lib/hooks/use-assets';
import { AssetForm } from '@/components/assets/asset-form';

export default function NewAssetPage() {
  const router = useRouter();
  const createAsset = useCreateAsset();

  const handleSubmit = async (data: any) => {
    try {
      await createAsset.mutateAsync({
        ...data,
        purchasePrice: parseFloat(data.purchasePrice),
        salvageValue: data.salvageValue ? parseFloat(data.salvageValue) : 0,
        usefulLifeMonths: parseInt(data.usefulLifeMonths, 10),
      });
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
          <h1 className="text-3xl font-bold tracking-tight">New Fixed Asset</h1>
          <p className="text-muted-foreground">Add a new fixed asset to your register</p>
        </div>
      </div>

      <AssetForm onSubmit={handleSubmit} isLoading={createAsset.isPending} mode="create" />
    </div>
  );
}
