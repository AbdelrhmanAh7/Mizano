'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CustomerForm } from '@/components/sales/customer-form';
import { useCreateCustomer } from '@/lib/hooks/use-customers';
import Link from 'next/link';

export default function NewCustomerPage() {
  const router = useRouter();
  const t = useTranslations('sales');

  const createCustomer = useCreateCustomer();

  const handleSubmit = async (data: Record<string, unknown>) => {
    try {
      await createCustomer.mutateAsync(
        data as unknown as Parameters<typeof createCustomer.mutateAsync>[0],
      );
      router.push('/sales/customers');
    } catch {
      // useCreateCustomer shows the translated success and error toasts.
    }
  };

  const handleCancel = () => {
    router.push('/sales/customers');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild aria-label={t('goBack')}>
          <Link href="/sales/customers">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('customers.newCustomer')}</h1>
          <p className="text-muted-foreground">{t('customers.newDescription')}</p>
        </div>
      </div>

      {/* Form */}
      <CustomerForm
        onSubmit={handleSubmit}
        onCancel={handleCancel}
        isSubmitting={createCustomer.isPending}
      />
    </div>
  );
}
