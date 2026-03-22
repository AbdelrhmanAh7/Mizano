'use client';

import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { JournalForm } from '@/components/accounting/journal-form';
import { useAccountsTree } from '@/lib/hooks/use-accounts';
import { useCreateJournal } from '@/lib/hooks/use-journals';
import { Skeleton } from '@/components/ui/skeleton';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

export default function NewJournalPage() {
  const t = useTranslations('accounting');
  const router = useRouter();
  const { toast } = useToast();

  const { data: accounts = [], isLoading: accountsLoading } = useAccountsTree();
  const createJournal = useCreateJournal();

  const handleSubmit = async (data: Record<string, unknown>) => {
    try {
      await createJournal.mutateAsync(
        data as unknown as Parameters<typeof createJournal.mutateAsync>[0],
      );
      toast({
        title: 'Journal created',
        description: 'The journal entry has been created successfully.',
      });
      router.push('/accounting/journals');
    } catch (error: unknown) {
      toast({
        title: 'Error',
        description:
          (error as { response?: { data?: { message?: string } } }).response?.data?.message ||
          'Failed to create journal entry.',
        variant: 'destructive',
      });
    }
  };

  const handleCancel = () => {
    router.push('/accounting/journals');
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
        <Button variant="ghost" size="icon" asChild aria-label="Go back">
          <Link href="/accounting/journals">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('journals.newJournal')}</h1>
          <p className="text-muted-foreground">Create a new manual journal entry</p>
        </div>
      </div>

      {/* Form */}
      <JournalForm
        accounts={accounts}
        onSubmit={handleSubmit}
        onCancel={handleCancel}
        isSubmitting={createJournal.isPending}
      />
    </div>
  );
}
