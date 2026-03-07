'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { TransferForm } from '@/components/inventory/transfer-form';
import { useCreateTransfer } from '@/lib/hooks/use-transfers';
import { useItems } from '@/lib/hooks/use-items';
import { useWarehouses } from '@/lib/hooks/use-warehouses';

export default function NewTransferPage() {
  const t = useTranslations('inventory');
  const router = useRouter();
  const createTransfer = useCreateTransfer();

  const { data: itemsData, isLoading: itemsLoading } = useItems();
  const { data: warehousesData, isLoading: warehousesLoading } = useWarehouses();

  const items = (itemsData?.data || []).map(
    (item: { id: string; name: string; sku: string; stockLevel?: number }) => ({
      id: item.id,
      name: item.name,
      sku: item.sku,
      stockLevel: item.stockLevel || 0,
    }),
  );

  const warehouses = (warehousesData?.data || []).map(
    (wh: { id: string; name: string; code: string }) => ({
      id: wh.id,
      name: wh.name,
      code: wh.code,
    }),
  );

  const handleSubmit = async (data: Record<string, unknown>) => {
    try {
      await createTransfer.mutateAsync(
        data as unknown as Parameters<typeof createTransfer.mutateAsync>[0],
      );
      router.push('/inventory/transfers');
    } catch (error) {
      // Error handled by mutation
    }
  };

  if (itemsLoading || warehousesLoading) {
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
        <Button variant="ghost" size="icon" asChild>
          <Link href="/inventory/transfers">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('transfers.newTransfer')}</h1>
          <p className="text-muted-foreground">{t('description')}</p>
        </div>
      </div>

      {/* Form */}
      <TransferForm
        items={items}
        warehouses={warehouses}
        onSubmit={handleSubmit}
        onCancel={() => router.push('/inventory/transfers')}
        isSubmitting={createTransfer.isPending}
      />
    </div>
  );
}
