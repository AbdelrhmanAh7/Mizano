'use client';

import { use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ItemForm } from '@/components/inventory/item-form';
import { useItem, useUpdateItem } from '@/lib/hooks/use-items';
import { useQuery } from '@tanstack/react-query';
import { accountsApi, taxRatesApi } from '@/lib/api';

interface EditItemPageProps {
  params: Promise<{ id: string }>;
}

export default function EditItemPage({ params }: EditItemPageProps) {
  const t = useTranslations('inventory');
  const { id } = use(params);
  const router = useRouter();
  const { data: item, isLoading: itemLoading } = useItem(id);
  const updateItem = useUpdateItem();

  // Fetch accounts
  const { data: accountsData, isLoading: accountsLoading } = useQuery({
    queryKey: ['accounts'],
    queryFn: async () => {
      const response = await accountsApi.getAll();
      return response.data;
    },
  });

  // Fetch tax rates
  const { data: taxRatesData, isLoading: taxRatesLoading } = useQuery({
    queryKey: ['tax-rates'],
    queryFn: async () => {
      try {
        const response = await taxRatesApi.getAll();
        return response.data;
      } catch {
        return { data: [] };
      }
    },
  });

  const accounts = accountsData?.data || [];
  const taxRates = taxRatesData?.data || [];

  const handleSubmit = async (data: Record<string, unknown>) => {
    try {
      await updateItem.mutateAsync({ id, data });
      router.push(`/inventory/items/${id}`);
    } catch (error) {
      // Error is handled in the hook
    }
  };

  if (itemLoading || accountsLoading || taxRatesLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (!item) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">
          {t('items.title')} {t('common.notFound')}
        </p>
        <Button asChild className="mt-4">
          <Link href="/inventory/items">
            {t('common.backTo')} {t('items.title')}
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href={`/inventory/items/${id}`}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('items.editItem')}</h1>
          <p className="text-muted-foreground">Update {item.name}</p>
        </div>
      </div>

      {/* Form */}
      <ItemForm
        item={item}
        accounts={accounts}
        taxRates={taxRates}
        onSubmit={handleSubmit}
        onCancel={() => router.push(`/inventory/items/${id}`)}
        isSubmitting={updateItem.isPending}
      />
    </div>
  );
}
