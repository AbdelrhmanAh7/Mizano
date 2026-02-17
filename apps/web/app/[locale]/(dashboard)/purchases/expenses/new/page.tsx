'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ExpenseForm } from '@/components/purchases/expense-form';
import { useCreateExpense } from '@/lib/hooks/use-expenses';
import { useQuery } from '@tanstack/react-query';
import { accountsApi } from '@/lib/api';

export default function NewExpensePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const defaultVendorId = searchParams.get('vendorId') || undefined;

  const createExpense = useCreateExpense();

  // Fetch accounts for dropdowns
  const { data: accountsData, isLoading: accountsLoading } = useQuery({
    queryKey: ['accounts'],
    queryFn: async () => {
      const response = await accountsApi.getAll();
      return response.data;
    },
  });

  const accounts = accountsData?.data || [];

  const handleSubmit = async (data: any) => {
    try {
      await createExpense.mutateAsync(data);
      router.push('/purchases/expenses');
    } catch (error) {
      // Error is handled in the hook
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
        <Button variant="ghost" size="icon" asChild aria-label="Go back">
          <Link href="/purchases/expenses">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">New Expense</h1>
          <p className="text-muted-foreground">Record a new business expense</p>
        </div>
      </div>

      {/* Form */}
      <ExpenseForm
        accounts={accounts}
        onSubmit={handleSubmit}
        onCancel={() => router.push('/purchases/expenses')}
        isSubmitting={createExpense.isPending}
        defaultVendorId={defaultVendorId}
      />
    </div>
  );
}
