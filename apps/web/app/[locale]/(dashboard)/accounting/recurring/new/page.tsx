'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/use-toast';
import { RecurringProfileForm } from '@/components/accounting/recurring-profile-form';
import { useAccountsTree } from '@/lib/hooks/use-accounts';
import { useCreateRecurringProfile } from '@/lib/hooks/use-recurring-profiles';

export default function NewRecurringProfilePage() {
  const router = useRouter();
  const { toast } = useToast();

  const { data: accounts = [], isLoading: accountsLoading } = useAccountsTree();
  const createProfile = useCreateRecurringProfile();

  const handleSubmit = async (data: any) => {
    try {
      await createProfile.mutateAsync(data);
      toast({
        title: 'Profile created',
        description: 'The recurring profile has been created successfully.',
      });
      router.push('/accounting/recurring');
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.response?.data?.message || 'Failed to create recurring profile.',
        variant: 'destructive',
      });
    }
  };

  const handleCancel = () => {
    router.push('/accounting/recurring');
  };

  if (accountsLoading) {
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/accounting/recurring">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">New Recurring Profile</h1>
          <p className="text-muted-foreground">
            Create a new recurring journal profile
          </p>
        </div>
      </div>

      {/* Form */}
      <RecurringProfileForm
        accounts={accounts}
        onSubmit={handleSubmit}
        onCancel={handleCancel}
        isSubmitting={createProfile.isPending}
      />
    </div>
  );
}
