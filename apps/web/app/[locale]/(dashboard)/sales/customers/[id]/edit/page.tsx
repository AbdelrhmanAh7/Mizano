'use client';

import { useParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/use-toast';
import { CustomerForm } from '@/components/sales/customer-form';
import { useCustomer, useUpdateCustomer } from '@/lib/hooks/use-customers';
import Link from 'next/link';

export default function EditCustomerPage() {
  const params = useParams();
  const router = useRouter();
  const t = useTranslations('sales');
  const { toast } = useToast();
  const customerId = params.id as string;

  const { data: customer, isLoading } = useCustomer(customerId);
  const updateCustomer = useUpdateCustomer();

  const handleSubmit = async (data: Record<string, unknown>) => {
    try {
      await updateCustomer.mutateAsync({ id: customerId, data });
      toast({
        title: t('customers.toast.updated'),
        description: t('customers.toast.updatedDescription'),
      });
      router.push(`/sales/customers/${customerId}`);
    } catch (error: unknown) {
      toast({
        title: 'Error',
        description:
          (error as { response?: { data?: { message?: string } } }).response?.data?.message ||
          t('customers.toast.updateError'),
        variant: 'destructive',
      });
    }
  };

  const handleCancel = () => {
    router.push(`/sales/customers/${customerId}`);
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10" />
          <Skeleton className="h-8 w-48" />
        </div>
        <Skeleton className="h-[400px] w-full" />
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild aria-label={t('goBack')}>
            <Link href="/sales/customers">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{t('customers.customerNotFound')}</h1>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild aria-label={t('goBack')}>
          <Link href={`/sales/customers/${customerId}`}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('customers.editCustomer')}</h1>
          <p className="text-muted-foreground">
            {t('customers.updateSubtitle', { name: customer.displayName || customer.name })}
          </p>
        </div>
      </div>

      {/* Form */}
      <CustomerForm
        customer={customer}
        onSubmit={handleSubmit}
        onCancel={handleCancel}
        isSubmitting={updateCustomer.isPending}
      />
    </div>
  );
}
