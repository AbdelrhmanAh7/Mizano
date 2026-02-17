'use client';

import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { RecurringProfileForm } from '@/components/accounting/recurring-profile-form';
import { useAccountsTree } from '@/lib/hooks/use-accounts';
import { useRecurringProfile, useUpdateRecurringProfile } from '@/lib/hooks/use-recurring-profiles';

export default function EditRecurringProfilePage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const profileId = params.id as string;

  const { data: accounts = [], isLoading: accountsLoading } = useAccountsTree();
  const { data: profile, isLoading: profileLoading } = useRecurringProfile(profileId);
  const updateProfile = useUpdateRecurringProfile();

  const isLoading = accountsLoading || profileLoading;

  const handleSubmit = async (data: any) => {
    try {
      await updateProfile.mutateAsync({ id: profileId, data });
      toast({
        title: 'Profile updated',
        description: 'The recurring profile has been updated successfully.',
      });
      router.push(`/accounting/recurring/${profileId}`);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.response?.data?.message || 'Failed to update recurring profile.',
        variant: 'destructive',
      });
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
          <Button variant="ghost" size="icon" asChild aria-label="Go back">
            <Link href="/accounting/recurring">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Profile Not Found</h1>
          </div>
        </div>
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">
              The recurring profile you&apos;re looking for doesn&apos;t exist.
            </p>
            <Button asChild className="mt-4">
              <Link href="/accounting/recurring">Back to Profiles</Link>
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
        <Button variant="ghost" size="icon" asChild aria-label="Go back">
          <Link href={`/accounting/recurring/${profileId}`}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Edit {profile.name}</h1>
          <p className="text-muted-foreground">Update the recurring profile details</p>
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
