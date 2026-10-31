'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ItemForm } from '@/components/inventory/item-form';
import { CreateItemData, useCreateItem } from '@/lib/hooks/use-items';
import { useQuery } from '@tanstack/react-query';
import { accountsApi } from '@/lib/api';

export default function NewItemPage() {
  const t = useTranslations('inventory');
  const router = useRouter();
  const createItem = useCreateItem();

  // Fetch accounts
  const { data: accountsData, isLoading: accountsLoading } = useQuery({
    queryKey: ['accounts'],
    queryFn: async () => {
      const response = await accountsApi.getAll();
      return response.data;
    },
  });

  const accounts = accountsData?.data || [];

  const handleSubmit = async (data: CreateItemData): Promise<void> => {
    try {
      await createItem.mutateAsync(data);
      router.push('/inventory/items');
    } catch {
      // The mutation's toast reports the error.
    }
  };

  if (accountsLoading) {
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
          <Link href="/inventory/items">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('items.newItem')}</h1>
          <p className="text-muted-foreground">{t('description')}</p>
        </div>
      </div>

      {/* Form */}
      <ItemForm
        accounts={accounts}
        onSubmit={handleSubmit}
        onCancel={() => router.push('/inventory/items')}
        isSubmitting={createItem.isPending}
      />
    </div>
  );
}
