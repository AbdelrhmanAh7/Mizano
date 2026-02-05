'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { BankAccountForm } from '@/components/banking/bank-account-form';
import { useCreateBankAccount } from '@/lib/hooks/use-bank-accounts';
import { useQuery } from '@tanstack/react-query';
import { accountsApi } from '@/lib/api';

export default function NewBankAccountPage() {
  const router = useRouter();
  const createBankAccount = useCreateBankAccount();

  // Fetch GL accounts for linking
  const { data: accountsData, isLoading: accountsLoading } = useQuery({
    queryKey: ['accounts', { type: 'ASSET' }],
    queryFn: async () => {
      const response = await accountsApi.getAll({ type: 'ASSET' });
      return response.data;
    },
  });

  const glAccounts = accountsData?.data || [];

  const handleSubmit = async (data: any) => {
    try {
      await createBankAccount.mutateAsync(data);
      router.push('/banking/accounts');
    } catch (error) {
      // Error handled by mutation
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
          <Link href="/banking/accounts">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">New Bank Account</h1>
          <p className="text-muted-foreground">
            Add a new bank account to track your finances
          </p>
        </div>
      </div>

      {/* Form */}
      <BankAccountForm
        glAccounts={glAccounts}
        onSubmit={handleSubmit}
        onCancel={() => router.push('/banking/accounts')}
        isSubmitting={createBankAccount.isPending}
      />
    </div>
  );
}
