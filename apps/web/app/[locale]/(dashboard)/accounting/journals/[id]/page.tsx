'use client';

import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Edit, CheckCircle, Trash2, Undo2, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/components/ui/use-toast';
import {
  useJournal,
  useDeleteJournal,
  usePostJournal,
  formatJournalAmount,
  getStatusColor,
  calculateJournalTotals,
  useReverseJournal,
  isJournalEditable,
  isSystemJournal,
  canReverseJournal,
  getJournalSourceInfo,
} from '@/lib/hooks/use-journals';
import { getApiErrorMessage } from '@/lib/api-error';
import { isPositiveDecimal } from '@/lib/decimal';
import { usePermissions } from '@/lib/hooks/use-permissions';
import { format } from 'date-fns';
import { useState } from 'react';
import { useTranslations } from 'next-intl';

export default function JournalDetailPage() {
  const t = useTranslations('accounting');
  const tCommon = useTranslations('common');
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const { hasPermission } = usePermissions();
  const journalId = params.id as string;

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [reverseDialogOpen, setReverseDialogOpen] = useState(false);

  const { data: journal, isLoading } = useJournal(journalId);
  const deleteJournal = useDeleteJournal();
  const postJournal = usePostJournal();
  const reverseJournal = useReverseJournal();

  const canEdit = hasPermission('accounting.edit');
  // Same permission as POST /journals/:id/reverse.
  const canReverse = hasPermission('accounting.create');
  const canDelete = hasPermission('accounting.delete');

  const handlePost = async () => {
    try {
      await postJournal.mutateAsync(journalId);
      toast({
        title: 'Journal posted',
        description: 'The journal entry has been posted successfully.',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: getApiErrorMessage(error, 'Failed to post journal.'),
        variant: 'destructive',
      });
    }
  };

  const confirmDelete = async () => {
    try {
      await deleteJournal.mutateAsync(journalId);
      toast({
        title: 'Journal deleted',
        description: 'The journal entry has been deleted.',
      });
      router.push('/accounting/journals');
    } catch (error) {
      toast({
        title: 'Error',
        description: getApiErrorMessage(error, 'Failed to delete journal.'),
        variant: 'destructive',
      });
    }
    setDeleteDialogOpen(false);
  };

  const confirmReverse = async () => {
    try {
      const reversal = await reverseJournal.mutateAsync({ id: journalId });
      toast({ title: t('journals.reversed'), description: reversal.journalNumber });
      router.push(`/accounting/journals/${reversal.id}`);
    } catch (error) {
      toast({
        title: t('journals.reverseFailed'),
        description: getApiErrorMessage(error, t('journals.reverseFailed')),
        variant: 'destructive',
      });
    }
    setReverseDialogOpen(false);
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10" />
          <Skeleton className="h-8 w-48" />
        </div>
        <Skeleton className="h-[200px] w-full" />
        <Skeleton className="h-[300px] w-full" />
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

  const lines = journal.lines || [];
  const editable = isJournalEditable(journal);
  const systemJournal = isSystemJournal(journal);
  const reversible = canReverseJournal(journal) && !systemJournal;
  const sourceInfo = getJournalSourceInfo(journal);
  const totals = calculateJournalTotals(
    lines.map((l) => ({ debit: l.debit || '0', credit: l.credit || '0' })),
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild aria-label="Go back">
            <Link href="/accounting/journals">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight">{journal.journalNumber}</h1>
              <Badge className={getStatusColor(journal.status)}>{journal.status}</Badge>
            </div>
            <p className="text-muted-foreground">
              {format(new Date(journal.entryDate), 'MMMM d, yyyy')}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {canEdit && editable && (
            <>
              <Button variant="outline" asChild>
                <Link href={`/accounting/journals/${journalId}/edit`}>
                  <Edit className="mr-2 h-4 w-4" />
                  {t('journals.editJournal')}
                </Link>
              </Button>
              <Button onClick={handlePost} disabled={postJournal.isPending}>
                <CheckCircle className="mr-2 h-4 w-4" />
                Post
              </Button>
            </>
          )}
          {canDelete && editable && (
            <Button variant="destructive" onClick={() => setDeleteDialogOpen(true)}>
              <Trash2 className="mr-2 h-4 w-4" />
              {t('journals.deleteJournal')}
            </Button>
          )}
          {canReverse && reversible && (
            <Button
              variant="outline"
              onClick={() => setReverseDialogOpen(true)}
              disabled={reverseJournal.isPending}
            >
              <Undo2 className="mr-2 h-4 w-4" />
              {t('journals.reverse')}
            </Button>
          )}
        </div>
      </div>

      {systemJournal && (
        <Card>
          <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div>
                <p className="font-medium">
                  {t('journals.sourceLabel')}: {t(`journals.source.${sourceInfo.labelKey}`)}
                </p>
                <p className="text-sm text-muted-foreground">{t('journals.systemNote')}</p>
              </div>
            </div>
            {sourceInfo.href && (
              <Button variant="outline" size="sm" asChild>
                <Link href={sourceInfo.href}>{t('journals.viewSource')}</Link>
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {journal.reversalOfId && (
        <p className="text-sm">
          <Link
            href={`/accounting/journals/${journal.reversalOfId}`}
            className="text-primary underline-offset-4 hover:underline"
          >
            {t('journals.reversalOf')}
          </Link>
        </p>
      )}

      {/* Journal Details */}
      <Card>
        <CardHeader>
          <CardTitle>{t('journals.journalDetails')}</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <dt className="text-sm font-medium text-muted-foreground">
                {t('journals.table.journalNumber')}
              </dt>
              <dd className="text-lg font-semibold">{journal.journalNumber}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted-foreground">
                {t('journals.form.date')}
              </dt>
              <dd className="text-lg">{format(new Date(journal.entryDate), 'MMMM d, yyyy')}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted-foreground">
                {t('recurring.table.status')}
              </dt>
              <dd>
                <Badge className={getStatusColor(journal.status)}>{journal.status}</Badge>
              </dd>
            </div>
            {journal.description && (
              <div className="col-span-full">
                <dt className="text-sm font-medium text-muted-foreground">
                  {t('journals.form.description')}
                </dt>
                <dd className="text-lg">{journal.description}</dd>
              </div>
            )}
            {journal.reference && (
              <div>
                <dt className="text-sm font-medium text-muted-foreground">
                  {t('journals.form.reference')}
                </dt>
                <dd className="text-lg">{journal.reference}</dd>
              </div>
            )}
          </dl>
        </CardContent>
      </Card>

      {/* Journal Lines */}
      <Card>
        <CardHeader>
          <CardTitle>{t('journals.form.lines')}</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('journals.form.account')}</TableHead>
                <TableHead>{t('journals.form.description')}</TableHead>
                <TableHead className="text-right">{t('journals.form.debit')}</TableHead>
                <TableHead className="text-right">{t('journals.form.credit')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map((line, index) => (
                <TableRow key={index}>
                  <TableCell>
                    <div>
                      <span className="font-medium">
                        {line.account?.code} - {line.account?.name}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>{line.description || '-'}</TableCell>
                  <TableCell className="text-right font-mono">
                    {isPositiveDecimal(line.debit || '0') ? formatJournalAmount(line.debit) : '-'}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {isPositiveDecimal(line.credit || '0') ? formatJournalAmount(line.credit) : '-'}
                  </TableCell>
                </TableRow>
              ))}
              {/* Totals Row */}
              <TableRow className="border-t-2 font-semibold">
                <TableCell colSpan={2}>Total</TableCell>
                <TableCell className="text-right font-mono">
                  {formatJournalAmount(totals.totalDebit)}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {formatJournalAmount(totals.totalCredit)}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('journals.deleteJournal')}</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this journal entry? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tCommon('buttons.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reverse Confirmation Dialog */}
      <AlertDialog open={reverseDialogOpen} onOpenChange={setReverseDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('journals.reverseTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('journals.reverseConfirm', { number: journal.journalNumber })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tCommon('buttons.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmReverse} disabled={reverseJournal.isPending}>
              {t('journals.reverse')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
