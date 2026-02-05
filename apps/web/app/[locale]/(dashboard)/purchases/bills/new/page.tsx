'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { BillForm } from '@/components/purchases/bill-form';
import { useCreateBill } from '@/lib/hooks/use-bills';
import { useQuery } from '@tanstack/react-query';
import { accountsApi, itemsApi } from '@/lib/api';

export default function NewBillPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const defaultVendorId = searchParams.get('vendorId') || undefined;

  const createBill = useCreateBill();

  // Fetch accounts for dropdowns
  const { data: accountsData, isLoading: accountsLoading } = useQuery({
    queryKey: ['accounts'],
    queryFn: async () => {
      const response = await accountsApi.getAll();
      return response.data;
    },
  });

  // Fetch items for dropdowns
  const { data: itemsData, isLoading: itemsLoading } = useQuery({
    queryKey: ['items'],
    queryFn: async () => {
      const response = await itemsApi.getAll();
      return response.data;
    },
  });

  const accounts = accountsData?.data || [];
  const items = itemsData?.data || [];

  const handleSubmit = async (data: any) => {
    try {
      await createBill.mutateAsync(data);
      router.push('/purchases/bills');
    } catch (error) {
      // Error is handled in the hook
    }
  };

  if (accountsLoading || itemsLoading) {
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
          <Link href="/purchases/bills">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">New Bill</h1>
          <p className="text-muted-foreground">
            Create a new vendor bill
          </p>
        </div>
      </div>

      {/* Form */}
      <BillForm
        accounts={accounts}
        items={items}
        onSubmit={handleSubmit}
        onCancel={() => router.push('/purchases/bills')}
        isSubmitting={createBill.isPending}
        defaultVendorId={defaultVendorId}
      />
    </div>
  );
}
