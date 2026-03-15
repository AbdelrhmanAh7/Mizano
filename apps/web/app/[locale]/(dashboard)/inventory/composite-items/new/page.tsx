'use client';

import { CompositeItemForm } from '@/components/inventory/composite-item-form';
import { Button } from '@/components/ui/button';
import { useCreateCompositeItem } from '@/lib/hooks/use-composite-items';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Suspense } from 'react';

function NewCompositeItemContent() {
  const router = useRouter();
  const createCompositeItem = useCreateCompositeItem();

  const handleSubmit = async (data: {
    name: string;
    sku: string;
    sellingPrice: string;
    description: string;
    components: Array<{ itemId: string; quantity: string }>;
  }) => {
    await createCompositeItem.mutateAsync(data);
    router.push('/inventory/composite-items');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/inventory/composite-items">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">New Composite Item</h1>
          <p className="text-muted-foreground">
            Create a bundled product from multiple component items.
          </p>
        </div>
      </div>

      <CompositeItemForm
        onSubmit={handleSubmit}
        isSubmitting={createCompositeItem.isPending}
        submitLabel="Create Composite Item"
      />
    </div>
  );
}

export default function NewCompositeItemPage() {
  return (
    <Suspense>
      <NewCompositeItemContent />
    </Suspense>
  );
}
