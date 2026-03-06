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

export default function EditJournalPage() {
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
        title: 'Journal updated',
        description: 'The journal entry has been updated successfully.',
      });
      router.push(`/accounting/journals/${journalId}`);
    } catch (error: unknown) {
      toast({
        title: 'Error',
        description:
          (error as { response?: { data?: { message?: string } } }).response?.data?.message ||
          'Failed to update journal entry.',
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
          <Button variant="ghost" size="icon" asChild aria-label="Go back">
            <Link href="/accounting/journals">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Journal Not Found</h1>
          </div>
        </div>
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">
              The journal entry you&apos;re looking for doesn&apos;t exist.
            </p>
            <Button asChild className="mt-4">
              <Link href="/accounting/journals">Back to Journals</Link>
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
          <Button variant="ghost" size="icon" asChild aria-label="Go back">
            <Link href={`/accounting/journals/${journalId}`}>
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Cannot Edit Journal</h1>
          </div>
        </div>
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">
              Only draft journals can be edited. This journal is {journal.status.toLowerCase()}.
            </p>
            <Button asChild className="mt-4">
              <Link href={`/accounting/journals/${journalId}`}>Back to Journal</Link>
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
          <Link href={`/accounting/journals/${journalId}`}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Edit {journal.journalNumber}</h1>
          <p className="text-muted-foreground">Update the journal entry details</p>
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
