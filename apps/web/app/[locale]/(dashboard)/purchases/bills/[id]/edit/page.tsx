'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { BillForm } from '@/components/purchases/bill-form';
import { useBill, useUpdateBill } from '@/lib/hooks/use-bills';
import { useQuery } from '@tanstack/react-query';
import { accountsApi, itemsApi } from '@/lib/api';

interface EditBillPageProps {
  params: { id: string };
}

export default function EditBillPage({ params }: EditBillPageProps) {
  const { id } = params;
  const router = useRouter();
  const t = useTranslations('purchases');
  const tCommon = useTranslations('common');
  const { data: bill, isLoading: billLoading } = useBill(id);
  const updateBill = useUpdateBill();

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

  const handleSubmit = async (data: Record<string, unknown>) => {
    try {
      await updateBill.mutateAsync({ id, data });
      router.push(`/purchases/bills/${id}`);
    } catch (error) {
      // Error is handled in the hook
    }
  };

  if (billLoading || accountsLoading || itemsLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (!bill) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">{tCommon('errors.notFound')}</p>
        <Button asChild className="mt-4">
          <Link href="/purchases/bills">{tCommon('buttons.back')}</Link>
        </Button>
      </div>
    );
  }

  if (bill.status !== 'DRAFT') {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Only draft bills can be edited</p>
        <Button asChild className="mt-4">
          <Link href={`/purchases/bills/${id}`}>{t('bills.billDetails')}</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild aria-label="Go back">
          <Link href={`/purchases/bills/${id}`}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('bills.editBill')}</h1>
          <p className="text-muted-foreground">{bill.billNumber}</p>
        </div>
      </div>

      {/* Form */}
      <BillForm
        bill={bill}
        accounts={accounts}
        items={items}
        onSubmit={handleSubmit}
        onCancel={() => router.push(`/purchases/bills/${id}`)}
        isSubmitting={updateBill.isPending}
      />
    </div>
  );
}
