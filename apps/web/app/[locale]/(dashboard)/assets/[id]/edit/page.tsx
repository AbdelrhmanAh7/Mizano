'use client';

import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useAsset, useUpdateAsset } from '@/lib/hooks/use-assets';
import { AssetForm } from '@/components/assets/asset-form';
import { format } from 'date-fns';

export default function EditAssetPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const { data: asset, isLoading } = useAsset(id);
  const updateAsset = useUpdateAsset();

  const handleSubmit = async (data: any) => {
    try {
      await updateAsset.mutateAsync({
        id,
        data: {
          ...data,
          purchasePrice: parseFloat(data.purchasePrice),
          salvageValue: data.salvageValue ? parseFloat(data.salvageValue) : 0,
          usefulLifeMonths: parseInt(data.usefulLifeMonths, 10),
        },
      });
      router.push(`/assets/${id}`);
    } catch {
      // Error handled by hook
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (!asset) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold">Asset Not Found</h1>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href={`/assets/${id}`}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Edit Asset</h1>
          <p className="text-muted-foreground">{asset.name}</p>
        </div>
      </div>

      <AssetForm
        defaultValues={{
          name: asset.name,
          description: asset.description || '',
          assetType: asset.assetType,
          purchaseDate: asset.purchaseDate ? format(new Date(asset.purchaseDate), 'yyyy-MM-dd') : '',
          purchasePrice: String(asset.purchasePrice),
          salvageValue: String(asset.salvageValue || 0),
          usefulLifeMonths: String(asset.usefulLifeMonths),
          depreciationMethod: asset.depreciationMethod,
          location: asset.location || '',
          serialNumber: asset.serialNumber || '',
        }}
        onSubmit={handleSubmit}
        isLoading={updateAsset.isPending}
        mode="edit"
      />
    </div>
  );
}
