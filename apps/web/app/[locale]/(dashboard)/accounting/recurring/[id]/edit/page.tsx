'use client';

import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import { RecurringProfileForm } from '@/components/accounting/recurring-profile-form';
import { useAccountsTree } from '@/lib/hooks/use-accounts';
import { useRecurringProfile, useUpdateRecurringProfile } from '@/lib/hooks/use-recurring-profiles';
import { useTranslations } from 'next-intl';

export default function EditRecurringProfilePage() {
  const tPage = useTranslations('accounting.recurring.page');
  const tDetail = useTranslations('accounting.recurring.detail');
  const params = useParams();
  const router = useRouter();
  const profileId = params.id as string;

  const { data: accounts = [], isLoading: accountsLoading } = useAccountsTree();
  const { data: profile, isLoading: profileLoading } = useRecurringProfile(profileId);
  const updateProfile = useUpdateRecurringProfile();

  const isLoading = accountsLoading || profileLoading;

  const handleSubmit = async (data: Record<string, unknown>) => {
    try {
      await updateProfile.mutateAsync({ id: profileId, data });
      router.push(`/accounting/recurring/${profileId}`);
    } catch {
      // Toasted by useUpdateRecurringProfile.
    }
  };

  const handleCancel = () => {
    router.push(`/accounting/recurring/${profileId}`);
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

  if (!profile) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild aria-label={tDetail('goBack')}>
            <Link href="/accounting/recurring">
              <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
            </Link>
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{tDetail('notFoundTitle')}</h1>
          </div>
        </div>
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">{tDetail('notFoundDescription')}</p>
            <Button asChild className="mt-4">
              <Link href="/accounting/recurring">{tDetail('backToProfiles')}</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild aria-label={tDetail('goBack')}>
          <Link href={`/accounting/recurring/${profileId}`}>
            <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            {tPage('editTitle', { name: profile.name })}
          </h1>
          <p className="text-muted-foreground">{tPage('editDescription')}</p>
        </div>
      </div>

      {/* Form */}
      <RecurringProfileForm
        profile={profile}
        accounts={accounts}
        onSubmit={handleSubmit}
        onCancel={handleCancel}
        isSubmitting={updateProfile.isPending}
      />
    </div>
  );
}
