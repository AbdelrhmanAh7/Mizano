'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { RecurringProfileForm } from '@/components/accounting/recurring-profile-form';
import { useAccountsTree } from '@/lib/hooks/use-accounts';
import { useCreateRecurringProfile } from '@/lib/hooks/use-recurring-profiles';
import { useTranslations } from 'next-intl';

export default function NewRecurringProfilePage() {
  const t = useTranslations('accounting');
  const tPage = useTranslations('accounting.recurring.page');
  const tDetail = useTranslations('accounting.recurring.detail');
  const router = useRouter();

  const { data: accounts = [], isLoading: accountsLoading } = useAccountsTree();
  const createProfile = useCreateRecurringProfile();

  const handleSubmit = async (data: Record<string, unknown>) => {
    try {
      await createProfile.mutateAsync(
        data as unknown as Parameters<typeof createProfile.mutateAsync>[0],
      );
      router.push('/accounting/recurring');
    } catch {
      // Toasted by useCreateRecurringProfile.
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
        <Button variant="ghost" size="icon" asChild aria-label={tDetail('goBack')}>
          <Link href="/accounting/recurring">
            <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('recurring.newProfile')}</h1>
          <p className="text-muted-foreground">{tPage('newDescription')}</p>
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
