'use client';

import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/use-toast';
import { JournalForm } from '@/components/accounting/journal-form';
import { useAccountsTree } from '@/lib/hooks/use-accounts';
import { useJournal, useUpdateJournal } from '@/lib/hooks/use-journals';
import { Card, CardContent } from '@/components/ui/card';
import { useTranslations } from 'next-intl';

export default function EditJournalPage() {
  const t = useTranslations('accounting');
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const journalId = params.id as string;

  const { data: accounts = [], isLoading: accountsLoading } = useAccountsTree();
  const { data: journal, isLoading: journalLoading } = useJournal(journalId);
  const updateJournal = useUpdateJournal();

  const isLoading = accountsLoading || journalLoading;

  const handleSubmit = async (data: Record<string, unknown>) => {
    try {
      await updateJournal.mutateAsync({ id: journalId, data });
      toast({
        title: t('journals.toast.updated'),
        description: t('journals.toast.updatedDescription'),
      });
      router.push(`/accounting/journals/${journalId}`);
    } catch (error: unknown) {
      toast({
        title: t('journals.toast.error'),
        description:
          (error as { response?: { data?: { message?: string } } }).response?.data?.message ||
          t('journals.toast.updateError'),
        variant: 'destructive',
      });
    }
  };

  const handleCancel = () => {
    router.push(`/accounting/journals/${journalId}`);
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

  if (!journal) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild aria-label={t('goBack')}>
            <Link href="/accounting/journals">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{t('journals.notFoundTitle')}</h1>
          </div>
        </div>
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">{t('journals.notFoundDescription')}</p>
            <Button asChild className="mt-4">
              <Link href="/accounting/journals">{t('journals.backToJournals')}</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (journal.status !== 'DRAFT') {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild aria-label={t('goBack')}>
            <Link href={`/accounting/journals/${journalId}`}>
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{t('journals.cannotEditTitle')}</h1>
          </div>
        </div>
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">
              {t('journals.cannotEditDescription', {
                status: t(`journals.status.${journal.status}`).toLowerCase(),
              })}
            </p>
            <Button asChild className="mt-4">
              <Link href={`/accounting/journals/${journalId}`}>{t('journals.backToJournal')}</Link>
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
        <Button variant="ghost" size="icon" asChild aria-label={t('goBack')}>
          <Link href={`/accounting/journals/${journalId}`}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            {t('journals.editJournal')} - {journal.journalNumber}
          </h1>
          <p className="text-muted-foreground">{t('journals.editDescription')}</p>
        </div>
      </div>

      {/* Form */}
      <JournalForm
        journal={journal}
        accounts={accounts}
        onSubmit={handleSubmit}
        onCancel={handleCancel}
        isSubmitting={updateJournal.isPending}
      />
    </div>
  );
}
