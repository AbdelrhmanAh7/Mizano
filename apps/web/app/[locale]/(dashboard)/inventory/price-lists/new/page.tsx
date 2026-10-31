'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PriceListForm } from '@/components/inventory/price-list-form';
import { CreatePriceListData, useCreatePriceList } from '@/lib/hooks/use-price-lists';

export default function NewPriceListPage(): JSX.Element {
  const t = useTranslations('inventory');
  const router = useRouter();
  const createPriceList = useCreatePriceList();

  const onSubmit = async (data: CreatePriceListData): Promise<void> => {
    try {
      await createPriceList.mutateAsync(data);
      router.push('/inventory/price-lists');
    } catch {
      // The mutation's toast reports the error.
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/inventory/price-lists">
            <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('priceLists.newPriceList')}</h1>
          <p className="text-muted-foreground">{t('priceLists.empty.description')}</p>
        </div>
      </div>

      <PriceListForm
        onSubmit={(data) => void onSubmit(data)}
        isSubmitting={createPriceList.isPending}
      />
    </div>
  );
}
