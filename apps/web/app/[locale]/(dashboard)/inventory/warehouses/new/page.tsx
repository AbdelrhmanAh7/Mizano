'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { WarehouseForm } from '@/components/inventory/warehouse-form';
import { useCreateWarehouse } from '@/lib/hooks/use-warehouses';

export default function NewWarehousePage() {
  const router = useRouter();
  const createWarehouse = useCreateWarehouse();

  const handleSubmit = async (data: any) => {
    try {
      await createWarehouse.mutateAsync(data);
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
          <h1 className="text-3xl font-bold tracking-tight">New Warehouse</h1>
          <p className="text-muted-foreground">
            Add a new storage location
          </p>
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
