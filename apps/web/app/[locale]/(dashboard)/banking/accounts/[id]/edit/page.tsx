'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { BankAccountForm } from '@/components/banking/bank-account-form';
import { useBankAccount, useUpdateBankAccount } from '@/lib/hooks/use-bank-accounts';
import { useQuery } from '@tanstack/react-query';
import { accountsApi } from '@/lib/api';
import { useTranslations } from 'next-intl';

interface EditBankAccountPageProps {
  params: { id: string };
}

export default function EditBankAccountPage({ params }: EditBankAccountPageProps) {
  const t = useTranslations('banking');
  const { id } = params;
  const router = useRouter();
  const { data: account, isLoading: accountLoading } = useBankAccount(id);
  const updateBankAccount = useUpdateBankAccount();

  const { data: accountsData, isLoading: accountsLoading } = useQuery({
    queryKey: ['accounts', { type: 'ASSET' }],
    queryFn: async () => {
      const response = await accountsApi.getAll({ type: 'ASSET' });
      return response.data;
    },
  });

  const glAccounts = accountsData?.data || [];

  const handleSubmit = async (data: Record<string, unknown>) => {
    try {
      await updateBankAccount.mutateAsync({ id, data });
      router.push(`/banking/accounts/${id}`);
    } catch (error) {
      // Error handled by mutation
    }
  };

  if (accountLoading || accountsLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (!account) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Bank account not found</p>
        <Button asChild className="mt-4">
          <Link href="/banking/accounts">Back to Accounts</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href={`/banking/accounts/${id}`}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('accounts.editAccount')}</h1>
          <p className="text-muted-foreground">{account.name}</p>
        </div>
      </div>

      {/* Form */}
      <BankAccountForm
        glAccounts={glAccounts}
        account={account}
        onSubmit={handleSubmit}
        onCancel={() => router.push(`/banking/accounts/${id}`)}
        isSubmitting={updateBankAccount.isPending}
      />
    </div>
  );
}
