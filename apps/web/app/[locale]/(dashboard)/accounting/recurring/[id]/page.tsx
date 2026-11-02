'use client';

import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useState } from 'react';
import { ArrowLeft, Edit, Play, Pause, Trash2, Calendar } from 'lucide-react';
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
import { DeleteConfirmDialog } from '@/components/shared/delete-confirm-dialog';
import {
  useRecurringProfile,
  useDeleteRecurringProfile,
  useToggleRecurringProfile,
  useExecuteRecurringProfile,
  useRecurringProfileExecutions,
  useFrequencyLabel,
} from '@/lib/hooks/use-recurring-profiles';
import { formatJournalAmount } from '@/lib/hooks/use-journals';
import { usePermissions } from '@/lib/hooks/use-permissions';
import { format } from 'date-fns';
import { useTranslations } from 'next-intl';
import { useDateFnsLocale } from '@/lib/date-locale';
import { useDateFormatter } from '@/lib/hooks/use-date-locale';

export default function RecurringProfileDetailPage() {
  const formatLongDate = useDateFormatter('long');
  const dateLocale = useDateFnsLocale();
  const t = useTranslations('accounting');
  const tPage = useTranslations('accounting.recurring.page');
  const tDetail = useTranslations('accounting.recurring.detail');
  const frequencyLabel = useFrequencyLabel();
  const params = useParams();
  const router = useRouter();
  const { hasPermission } = usePermissions();
  const profileId = params.id as string;

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const { data: profile, isLoading } = useRecurringProfile(profileId);
  const deleteProfile = useDeleteRecurringProfile();
  const toggleProfile = useToggleRecurringProfile();
  const executeProfile = useExecuteRecurringProfile();
  const { data: executions, isError: executionsError } = useRecurringProfileExecutions(
    profileId,
    10,
  );
  const executionStatus = (status?: string): string => {
    const key = `executionStatus.${status || 'success'}`;
    return tDetail.has(key) ? tDetail(key) : String(status);
  };

  const canEdit = hasPermission('accounting.edit');
  const canDelete = hasPermission('accounting.delete');

  // The mutation hooks show the success and error toasts.
  const handleExecute = () => {
    executeProfile.mutate(profileId);
  };

  const handleToggle = () => {
    toggleProfile.mutate(profileId);
  };

  const confirmDelete = async () => {
    try {
      await deleteProfile.mutateAsync(profileId);
      router.push('/accounting/recurring');
    } catch {
      // Toasted by useDeleteRecurringProfile.
    }
    setDeleteDialogOpen(false);
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

  const lines = profile.lines || [];
  const totalDebit = lines.reduce((sum, line) => sum + parseFloat(line.debit || '0'), 0);
  const totalCredit = lines.reduce((sum, line) => sum + parseFloat(line.credit || '0'), 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild aria-label={tDetail('goBack')}>
            <Link href="/accounting/recurring">
              <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight">{profile.name}</h1>
              <Badge
                className={
                  profile.isActive ? 'bg-success/10 text-success' : 'bg-muted text-foreground'
                }
              >
                {profile.isActive ? tPage('active') : tPage('inactive')}
              </Badge>
            </div>
            <p className="text-muted-foreground">
              {profile.description || tDetail('noDescription')}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {canEdit && (
            <>
              <Button variant="outline" onClick={handleExecute}>
                <Play className="me-2 h-4 w-4" />
                {tPage('executeNow')}
              </Button>
              <Button variant="outline" onClick={handleToggle}>
                {profile.isActive ? (
                  <>
                    <Pause className="me-2 h-4 w-4" />
                    {tPage('pause')}
                  </>
                ) : (
                  <>
                    <Play className="me-2 h-4 w-4" />
                    {tPage('activate')}
                  </>
                )}
              </Button>
              <Button variant="outline" asChild>
                <Link href={`/accounting/recurring/${profileId}/edit`}>
                  <Edit className="me-2 h-4 w-4" />
                  {t('recurring.editProfile')}
                </Link>
              </Button>
            </>
          )}
          {canDelete && (
            <Button variant="destructive" onClick={() => setDeleteDialogOpen(true)}>
              <Trash2 className="me-2 h-4 w-4" />
              {t('recurring.deleteProfile')}
            </Button>
          )}
        </div>
      </div>

      {/* Profile Details */}
      <Card>
        <CardHeader>
          <CardTitle>{t('recurring.profileDetails')}</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <dt className="text-sm font-medium text-muted-foreground">
                {t('recurring.form.frequency')}
              </dt>
              <dd className="mt-1">
                <Badge variant="outline">{frequencyLabel(profile.frequency)}</Badge>
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted-foreground">
                {t('recurring.table.nextRun')}
              </dt>
              <dd className="mt-1 flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                {formatLongDate(new Date(profile.nextRunDate))}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted-foreground">
                {t('recurring.form.autoPost')}
              </dt>
              <dd className="mt-1">
                <Badge variant={profile.autoPost ? 'default' : 'secondary'}>
                  {profile.autoPost ? tDetail('autoPostYes') : tDetail('autoPostNo')}
                </Badge>
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted-foreground">
                {t('recurring.table.status')}
              </dt>
              <dd className="mt-1">
                <Badge
                  className={
                    profile.isActive ? 'bg-success/10 text-success' : 'bg-muted text-foreground'
                  }
                >
                  {profile.isActive ? tPage('active') : tPage('inactive')}
                </Badge>
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted-foreground">{tDetail('created')}</dt>
              <dd className="mt-1">
                {format(new Date(profile.createdAt), 'PP', { locale: dateLocale })}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted-foreground">
                {tDetail('lastModified')}
              </dt>
              <dd className="mt-1">
                {format(new Date(profile.updatedAt), 'PP', { locale: dateLocale })}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      {/* Journal Template */}
      <Card>
        <CardHeader>
          <CardTitle>{tDetail('journalTemplate')}</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('journals.form.account')}</TableHead>
                <TableHead>{t('journals.form.description')}</TableHead>
                <TableHead className="text-end">{t('journals.form.debit')}</TableHead>
                <TableHead className="text-end">{t('journals.form.credit')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map((line, index) => (
                <TableRow key={index}>
                  <TableCell>
                    <span className="font-medium">
                      <bdi>{line.account?.code}</bdi> - {line.account?.name}
                    </span>
                  </TableCell>
                  <TableCell>{line.description || '-'}</TableCell>
                  <TableCell className="text-end font-mono">
                    {parseFloat(line.debit || '0') > 0
                      ? formatJournalAmount(parseFloat(line.debit))
                      : '-'}
                  </TableCell>
                  <TableCell className="text-end font-mono">
                    {parseFloat(line.credit || '0') > 0
                      ? formatJournalAmount(parseFloat(line.credit))
                      : '-'}
                  </TableCell>
                </TableRow>
              ))}
              {/* Totals Row */}
              <TableRow className="border-t-2 font-semibold">
                <TableCell colSpan={2}>{tDetail('total')}</TableCell>
                <TableCell className="text-end font-mono">
                  {formatJournalAmount(totalDebit)}
                </TableCell>
                <TableCell className="text-end font-mono">
                  {formatJournalAmount(totalCredit)}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Execution History */}
      <Card>
        <CardHeader>
          <CardTitle>{tDetail('executionHistory')}</CardTitle>
        </CardHeader>
        <CardContent>
          {executionsError ? (
            <p className="text-sm text-muted-foreground" role="alert">
              {tDetail('executionsError')}
            </p>
          ) : executions && Array.isArray(executions) && executions.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{tDetail('date')}</TableHead>
                  <TableHead>{tDetail('journal')}</TableHead>
                  <TableHead>{tDetail('status')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {executions.map(
                  (
                    exec: {
                      id: string;
                      executedAt: string;
                      journalNumber?: string;
                      status?: string;
                    },
                    index: number,
                  ) => (
                    <TableRow key={exec.id || index}>
                      <TableCell>
                        {format(new Date(exec.executedAt), 'PP p', { locale: dateLocale })}
                      </TableCell>
                      <TableCell>{exec.journalNumber || '-'}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{executionStatus(exec.status)}</Badge>
                      </TableCell>
                    </TableRow>
                  ),
                )}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground">{tDetail('noExecutions')}</p>
          )}
        </CardContent>
      </Card>

      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title={t('recurring.deleteProfile')}
        description={tPage('deleteConfirmThis')}
        onConfirm={confirmDelete}
        cancelLabel={tPage('cancel')}
        deleteLabel={tPage('delete')}
      />
    </div>
  );
}
