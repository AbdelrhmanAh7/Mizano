'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { BankRuleForm } from '@/components/banking/bank-rule-form';
import { useCreateBankRule } from '@/lib/hooks/use-bank-rules';
import { useQuery } from '@tanstack/react-query';
import { accountsApi, customersApi, vendorsApi } from '@/lib/api';
import { useTranslations } from 'next-intl';

export default function NewBankRulePage() {
  const router = useRouter();
  const t = useTranslations('banking');
  const tCommon = useTranslations('common');
  const createBankRule = useCreateBankRule();

  // Fetch accounts
  const {
    data: accountsData,
    isLoading: accountsLoading,
    isError: accountsFailed,
    refetch: refetchAccounts,
  } = useQuery({
    queryKey: ['accounts', { type: 'EXPENSE' }],
    queryFn: async () => {
      const response = await accountsApi.getAll({ type: 'EXPENSE' });
      return response.data;
    },
  });

  // Fetch vendors
  const {
    data: vendorsData,
    isLoading: vendorsLoading,
    isError: vendorsFailed,
    refetch: refetchVendors,
  } = useQuery({
    queryKey: ['vendors'],
    queryFn: async () => {
      const response = await vendorsApi.getAll();
      return response.data;
    },
  });

  // Fetch customers
  const {
    data: customersData,
    isLoading: customersLoading,
    isError: customersFailed,
    refetch: refetchCustomers,
  } = useQuery({
    queryKey: ['customers'],
    queryFn: async () => {
      const response = await customersApi.getAll();
      return response.data;
    },
  });

  const accounts = accountsData?.data || [];
  const vendors = vendorsData?.data || [];
  const customers = customersData?.data || [];

  const isLoading = accountsLoading || vendorsLoading || customersLoading;
  const lookupsFailed = accountsFailed || vendorsFailed || customersFailed;
  const retryLookups = (): void => {
    if (accountsFailed) void refetchAccounts();
    if (vendorsFailed) void refetchVendors();
    if (customersFailed) void refetchCustomers();
  };

  const handleSubmit = async (data: Record<string, unknown>) => {
    try {
      await createBankRule.mutateAsync(data);
      router.push('/banking/rules');
    } catch (error) {
      // Error handled by mutation
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (lookupsFailed) {
    return (
      <div className="text-center py-12 space-y-4" role="alert">
        <p className="text-muted-foreground">{tCommon('errors.generic')}</p>
        <Button variant="outline" onClick={retryLookups}>
          {tCommon('dashboard.tryAgain')}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild aria-label={tCommon('buttons.back')}>
          <Link href="/banking/rules">
            <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('rules.newRuleTitle')}</h1>
          <p className="text-muted-foreground">{t('rules.newRuleDescription')}</p>
        </div>
      </div>

      {/* Form */}
      <BankRuleForm
        accounts={accounts}
        vendors={vendors}
        customers={customers}
        onSubmit={handleSubmit}
        onCancel={() => router.push('/banking/rules')}
        isSubmitting={createBankRule.isPending}
      />
    </div>
  );
}
