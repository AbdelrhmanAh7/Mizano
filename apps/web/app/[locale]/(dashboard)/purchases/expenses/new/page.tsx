'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ExpenseForm, LookupAccount } from '@/components/purchases/expense-form';
import { useCreateExpense } from '@/lib/hooks/use-expenses';
import { useQuery } from '@tanstack/react-query';
import { expensesApi } from '@/lib/api';

export default function NewExpensePage() {
  const router = useRouter();
  const t = useTranslations('purchases');
  const searchParams = useSearchParams();
  const defaultVendorId = searchParams.get('vendorId') || undefined;

  const createExpense = useCreateExpense();

  // Role-scoped lookups: purchases.create is enough, accounting.view is not required.
  const expenseAccountsQuery = useQuery({
    queryKey: ['expenses', 'expense-accounts'],
    queryFn: async (): Promise<LookupAccount[]> =>
      (await expensesApi.expenseAccounts()).data as LookupAccount[],
  });
  const paidThroughQuery = useQuery({
    queryKey: ['expenses', 'paid-through-accounts'],
    queryFn: async (): Promise<LookupAccount[]> =>
      (await expensesApi.paidThroughAccounts()).data as LookupAccount[],
  });

  const handleSubmit = async (
    data: Parameters<typeof createExpense.mutateAsync>[0],
  ): Promise<void> => {
    try {
      await createExpense.mutateAsync(data);
      router.push('/purchases/expenses');
    } catch {
      // Error is surfaced by the mutation's toast.
    }
  };

  const isLoading = expenseAccountsQuery.isLoading || paidThroughQuery.isLoading;
  const isError = expenseAccountsQuery.isError || paidThroughQuery.isError;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild aria-label={t('goBack')}>
          <Link href="/purchases/expenses">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('expenses.newExpense')}</h1>
          <p className="text-muted-foreground">{t('expenses.newDescription')}</p>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-6">
          <Skeleton className="h-96" />
        </div>
      ) : isError ? (
        <div className="rounded-md border border-destructive/50 p-6 text-center" role="alert">
          <p className="text-destructive">{t('expenses.form.loadError')}</p>
          <Button
            className="mt-4"
            variant="outline"
            onClick={() => {
              void expenseAccountsQuery.refetch();
              void paidThroughQuery.refetch();
            }}
          >
            {t('expenses.form.retry')}
          </Button>
        </div>
      ) : (
        <ExpenseForm
          expenseAccounts={expenseAccountsQuery.data ?? []}
          paidThroughAccounts={paidThroughQuery.data ?? []}
          onSubmit={(data) => void handleSubmit(data)}
          onCancel={() => router.push('/purchases/expenses')}
          isSubmitting={createExpense.isPending}
          defaultVendorId={defaultVendorId}
        />
      )}
    </div>
  );
}
