'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Plus, Search, RefreshCw, Filter, Eye, Edit, Trash2, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/use-toast';
import {
  useJournals,
  useDeleteJournal,
  usePostJournal,
  Journal,
  JournalStatus,
  formatJournalAmount,
  getStatusColor,
} from '@/lib/hooks/use-journals';
import { usePermissions } from '@/lib/hooks/use-permissions';
import { format } from 'date-fns';

export default function JournalsPage() {
  const { toast } = useToast();
  const { hasPermission } = usePermissions();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [journalToDelete, setJournalToDelete] = useState<Journal | null>(null);

  const { data: journalsData, isLoading, refetch } = useJournals({
    search: searchQuery || undefined,
    status: selectedStatus !== 'all' ? selectedStatus : undefined,
  });
  const deleteJournal = useDeleteJournal();
  const postJournal = usePostJournal();

  const journals = journalsData?.data || [];

  const canCreate = hasPermission('accounting.create');
  const canEdit = hasPermission('accounting.edit');
  const canDelete = hasPermission('accounting.delete');

  const handleDelete = (journal: Journal) => {
    setJournalToDelete(journal);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (journalToDelete) {
      try {
        await deleteJournal.mutateAsync(journalToDelete.id);
        toast({
          title: 'Journal deleted',
          description: `Journal ${journalToDelete.journalNumber} has been deleted.`,
        });
      } catch (error) {
        toast({
          title: 'Error',
          description: 'Failed to delete journal. It may have associated records.',
          variant: 'destructive',
        });
      }
      setDeleteDialogOpen(false);
      setJournalToDelete(null);
    }
  };

  const handlePost = async (journal: Journal) => {
    try {
      await postJournal.mutateAsync(journal.id);
      toast({
        title: 'Journal posted',
        description: `Journal ${journal.journalNumber} has been posted.`,
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to post journal.',
        variant: 'destructive',
      });
    }
  };

  const calculateTotal = (journal: Journal) => {
    return journal.lines?.reduce((sum, line) => sum + parseFloat(line.debit || '0'), 0) || 0;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Journal Entries</h1>
          <p className="text-muted-foreground">
            Create and manage manual journal entries
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canCreate && (
            <Button asChild>
              <Link href="/accounting/journals/new">
                <Plus className="mr-2 h-4 w-4" />
                New Journal
              </Link>
            </Button>
          )}
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by journal number or description..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={selectedStatus} onValueChange={setSelectedStatus}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="DRAFT">Draft</SelectItem>
                <SelectItem value="POSTED">Posted</SelectItem>
                <SelectItem value="VOIDED">Voided</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="icon" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Journals Table */}
      <Card>
        <CardHeader>
          <CardTitle>Journals</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : journals.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground mb-4">No journal entries found</p>
              {canCreate && (
                <Button asChild>
                  <Link href="/accounting/journals/new">
                    <Plus className="mr-2 h-4 w-4" />
                    Create Your First Journal
                  </Link>
                </Button>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Journal #</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {journals.map((journal: Journal) => (
                  <TableRow key={journal.id}>
                    <TableCell className="font-medium">
                      {journal.journalNumber}
                    </TableCell>
                    <TableCell>
                      {format(new Date(journal.entryDate), 'MMM d, yyyy')}
                    </TableCell>
                    <TableCell className="max-w-[300px] truncate">
                      {journal.description || '-'}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {formatJournalAmount(calculateTotal(journal))}
                    </TableCell>
                    <TableCell>
                      <Badge className={getStatusColor(journal.status)}>
                        {journal.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm">
                            •••
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem asChild>
                            <Link href={`/accounting/journals/${journal.id}`}>
                              <Eye className="mr-2 h-4 w-4" />
                              View
                            </Link>
                          </DropdownMenuItem>
                          {canEdit && journal.status === 'DRAFT' && (
                            <>
                              <DropdownMenuItem asChild>
                                <Link href={`/accounting/journals/${journal.id}/edit`}>
                                  <Edit className="mr-2 h-4 w-4" />
                                  Edit
                                </Link>
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handlePost(journal)}>
                                <CheckCircle className="mr-2 h-4 w-4" />
                                Post
                              </DropdownMenuItem>
                            </>
                          )}
                          {canDelete && journal.status === 'DRAFT' && (
                            <DropdownMenuItem
                              onClick={() => handleDelete(journal)}
                              className="text-red-600"
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Journal</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{journalToDelete?.journalNumber}&quot;? This
              action cannot be undone.
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
