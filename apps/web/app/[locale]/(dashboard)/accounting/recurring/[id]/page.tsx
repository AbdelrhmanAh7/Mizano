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
  useRecurringProfile,
  useDeleteRecurringProfile,
  useToggleRecurringProfile,
  getFrequencyLabel,
} from '@/lib/hooks/use-recurring-profiles';
import { formatJournalAmount } from '@/lib/hooks/use-journals';
import { usePermissions } from '@/lib/hooks/use-permissions';
import { format } from 'date-fns';
import { useTranslations } from 'next-intl';

export default function RecurringProfileDetailPage() {
  const t = useTranslations('accounting');
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const { hasPermission } = usePermissions();
  const profileId = params.id as string;

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const { data: profile, isLoading } = useRecurringProfile(profileId);
  const deleteProfile = useDeleteRecurringProfile();
  const toggleProfile = useToggleRecurringProfile();

  const canEdit = hasPermission('accounting.edit');
  const canDelete = hasPermission('accounting.delete');

  const handleToggle = async () => {
    try {
      await toggleProfile.mutateAsync(profileId);
      toast({
        title: profile?.isActive ? 'Profile paused' : 'Profile activated',
        description: `"${profile?.name}" has been ${profile?.isActive ? 'paused' : 'activated'}.`,
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to toggle recurring profile.',
        variant: 'destructive',
      });
    }
  };

  const confirmDelete = async () => {
    try {
      await deleteProfile.mutateAsync(profileId);
      toast({
        title: 'Profile deleted',
        description: 'The recurring profile has been deleted.',
      });
      router.push('/accounting/recurring');
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to delete recurring profile.',
        variant: 'destructive',
      });
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

  const lines = profile.lines || [];
  const totalDebit = lines.reduce((sum, line) => sum + parseFloat(line.debit || '0'), 0);
  const totalCredit = lines.reduce((sum, line) => sum + parseFloat(line.credit || '0'), 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild aria-label="Go back">
            <Link href="/accounting/recurring">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight">{profile.name}</h1>
              <Badge
                className={
                  profile.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                }
              >
                {profile.isActive ? 'Active' : 'Inactive'}
              </Badge>
            </div>
            <p className="text-muted-foreground">{profile.description || 'No description'}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {canEdit && (
            <>
              <Button variant="outline" onClick={handleToggle}>
                {profile.isActive ? (
                  <>
                    <Pause className="mr-2 h-4 w-4" />
                    Pause
                  </>
                ) : (
                  <>
                    <Play className="mr-2 h-4 w-4" />
                    Activate
                  </>
                )}
              </Button>
              <Button variant="outline" asChild>
                <Link href={`/accounting/recurring/${profileId}/edit`}>
                  <Edit className="mr-2 h-4 w-4" />
                  {t('recurring.editProfile')}
                </Link>
              </Button>
            </>
          )}
          {canDelete && (
            <Button variant="destructive" onClick={() => setDeleteDialogOpen(true)}>
              <Trash2 className="mr-2 h-4 w-4" />
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
                <Badge variant="outline">{getFrequencyLabel(profile.frequency)}</Badge>
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted-foreground">
                {t('recurring.table.nextRun')}
              </dt>
              <dd className="mt-1 flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                {format(new Date(profile.nextExecutionDate), 'MMMM d, yyyy')}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted-foreground">
                {t('recurring.form.autoPost')}
              </dt>
              <dd className="mt-1">
                <Badge variant={profile.autoPost ? 'default' : 'secondary'}>
                  {profile.autoPost ? 'Yes - Auto Post' : 'No - Save as Draft'}
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
                    profile.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                  }
                >
                  {profile.isActive ? 'Active' : 'Inactive'}
                </Badge>
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted-foreground">Created</dt>
              <dd className="mt-1">{format(new Date(profile.createdAt), 'MMM d, yyyy')}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted-foreground">Last Modified</dt>
              <dd className="mt-1">{format(new Date(profile.updatedAt), 'MMM d, yyyy')}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      {/* Journal Template */}
      <Card>
        <CardHeader>
          <CardTitle>Journal Template</CardTitle>
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
                    <span className="font-medium">
                      {line.account?.code} - {line.account?.name}
                    </span>
                  </TableCell>
                  <TableCell>{line.description || '-'}</TableCell>
                  <TableCell className="text-right font-mono">
                    {parseFloat(line.debit || '0') > 0
                      ? formatJournalAmount(parseFloat(line.debit))
                      : '-'}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {parseFloat(line.credit || '0') > 0
                      ? formatJournalAmount(parseFloat(line.credit))
                      : '-'}
                  </TableCell>
                </TableRow>
              ))}
              {/* Totals Row */}
              <TableRow className="border-t-2 font-semibold">
                <TableCell colSpan={2}>Total</TableCell>
                <TableCell className="text-right font-mono">
                  {formatJournalAmount(totalDebit)}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {formatJournalAmount(totalCredit)}
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
            <AlertDialogTitle>{t('recurring.deleteProfile')}</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this recurring profile? This action cannot be undone.
              Previously created journals will not be affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-red-600 hover:bg-red-700">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
