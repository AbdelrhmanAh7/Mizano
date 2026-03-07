'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { WarehouseForm } from '@/components/inventory/warehouse-form';
import { useCreateWarehouse } from '@/lib/hooks/use-warehouses';

export default function NewWarehousePage() {
  const t = useTranslations('inventory');
  const router = useRouter();
  const createWarehouse = useCreateWarehouse();

  const handleSubmit = async (data: Record<string, unknown>) => {
    try {
      await createWarehouse.mutateAsync(
        data as unknown as Parameters<typeof createWarehouse.mutateAsync>[0],
      );
      router.push('/inventory/warehouses');
    } catch (error) {
      // Error is handled in the hook
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/inventory/warehouses">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('warehouses.newWarehouse')}</h1>
          <p className="text-muted-foreground">{t('description')}</p>
        </div>
      </div>

      {/* Form */}
      <WarehouseForm
        onSubmit={handleSubmit}
        onCancel={() => router.push('/inventory/warehouses')}
        isSubmitting={createWarehouse.isPending}
      />
    </div>
  );
}
