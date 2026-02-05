'use client';

import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Edit, CheckCircle, Trash2 } from 'lucide-react';
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
} from '@/lib/hooks/use-journals';
import { usePermissions } from '@/lib/hooks/use-permissions';
import { format } from 'date-fns';
import { useState } from 'react';

export default function JournalDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const { hasPermission } = usePermissions();
  const journalId = params.id as string;

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const { data: journal, isLoading } = useJournal(journalId);
  const deleteJournal = useDeleteJournal();
  const postJournal = usePostJournal();

  const canEdit = hasPermission('accounting.edit');
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
        description: 'Failed to post journal.',
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
        description: 'Failed to delete journal.',
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

  if (!journal) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
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
  const totals = calculateJournalTotals(
    lines.map((l) => ({ debit: l.debit || '0', credit: l.credit || '0' }))
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/accounting/journals">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight">
                {journal.journalNumber}
              </h1>
              <Badge className={getStatusColor(journal.status)}>
                {journal.status}
              </Badge>
            </div>
            <p className="text-muted-foreground">
              {format(new Date(journal.entryDate), 'MMMM d, yyyy')}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {canEdit && journal.status === 'DRAFT' && (
            <>
              <Button variant="outline" asChild>
                <Link href={`/accounting/journals/${journalId}/edit`}>
                  <Edit className="mr-2 h-4 w-4" />
                  Edit
                </Link>
              </Button>
              <Button onClick={handlePost}>
                <CheckCircle className="mr-2 h-4 w-4" />
                Post
              </Button>
            </>
          )}
          {canDelete && journal.status === 'DRAFT' && (
            <Button
              variant="destructive"
              onClick={() => setDeleteDialogOpen(true)}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </Button>
          )}
        </div>
      </div>

      {/* Journal Details */}
      <Card>
        <CardHeader>
          <CardTitle>Journal Details</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <dt className="text-sm font-medium text-muted-foreground">
                Journal Number
              </dt>
              <dd className="text-lg font-semibold">{journal.journalNumber}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted-foreground">
                Entry Date
              </dt>
              <dd className="text-lg">
                {format(new Date(journal.entryDate), 'MMMM d, yyyy')}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted-foreground">Status</dt>
              <dd>
                <Badge className={getStatusColor(journal.status)}>
                  {journal.status}
                </Badge>
              </dd>
            </div>
            {journal.description && (
              <div className="col-span-full">
                <dt className="text-sm font-medium text-muted-foreground">
                  Description
                </dt>
                <dd className="text-lg">{journal.description}</dd>
              </div>
            )}
            {journal.reference && (
              <div>
                <dt className="text-sm font-medium text-muted-foreground">
                  Reference
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
          <CardTitle>Journal Lines</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Account</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Debit</TableHead>
                <TableHead className="text-right">Credit</TableHead>
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
            <AlertDialogTitle>Delete Journal</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this journal entry? This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
