'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ItemForm } from '@/components/inventory/item-form';
import { useCreateItem } from '@/lib/hooks/use-items';
import { useQuery } from '@tanstack/react-query';
import { accountsApi, taxRatesApi } from '@/lib/api';

export default function NewItemPage() {
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
      await createItem.mutateAsync(data);
      router.push('/inventory/items');
    } catch (error) {
      // Error is handled in the hook
    }
  };

  if (accountsLoading || taxRatesLoading) {
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
          <h1 className="text-3xl font-bold tracking-tight">New Item</h1>
          <p className="text-muted-foreground">Add a new product or service</p>
        </div>
      </div>

      {/* Form */}
      <ItemForm
        accounts={accounts}
        taxRates={taxRates}
        onSubmit={handleSubmit}
        onCancel={() => router.push('/inventory/items')}
        isSubmitting={createItem.isPending}
      />
    </div>
  );
}
