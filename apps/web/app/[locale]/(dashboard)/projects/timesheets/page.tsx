'use client';

import { useState } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { Plus, Search, Clock, Calendar, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useTimesheets,
  useDeleteTimesheet,
  formatCurrency,
  formatHours,
  TimesheetEntry,
} from '@/lib/hooks/use-projects';

export default function TimesheetsPage() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data, isLoading } = useTimesheets({
    status: statusFilter !== 'all' ? (statusFilter as 'UNBILLED' | 'INVOICED') : undefined,
  });

  const deleteTimesheet = useDeleteTimesheet();

  const entries: TimesheetEntry[] = data?.data || [];

  const handleDelete = async () => {
    if (deleteId) {
      await deleteTimesheet.mutateAsync(deleteId);
      setDeleteId(null);
    }
  };

  // Calculate totals
  const totalHours = entries.reduce((sum, e) => {
    const hours = typeof e.hours === 'string' ? parseFloat(e.hours) : e.hours;
    return sum + (hours || 0);
  }, 0);

  const unbilledHours = entries
    .filter((e) => e.status === 'UNBILLED')
    .reduce((sum, e) => {
      const hours = typeof e.hours === 'string' ? parseFloat(e.hours) : e.hours;
      return sum + (hours || 0);
    }, 0);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-10 w-32" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Timesheets</h1>
          <p className="text-muted-foreground">
            Track time spent on projects and tasks
          </p>
        </div>
        <Button asChild>
          <Link href="/projects/timesheets/new">
            <Plus className="mr-2 h-4 w-4" />
            Log Time
          </Link>
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Clock className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Hours</p>
                <p className="text-2xl font-bold font-mono">{formatHours(totalHours)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-yellow-100 rounded-lg">
                <Calendar className="h-5 w-5 text-yellow-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Unbilled Hours</p>
                <p className="text-2xl font-bold font-mono">{formatHours(unbilledHours)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search entries..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="UNBILLED">Unbilled</SelectItem>
            <SelectItem value="INVOICED">Invoiced</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      {entries.length === 0 ? (
        <div className="text-center py-12">
          <Clock className="mx-auto h-12 w-12 text-muted-foreground" />
          <h3 className="mt-4 text-lg font-semibold">No time entries</h3>
          <p className="text-muted-foreground">
            Start logging time on your projects and tasks.
          </p>
          <Button asChild className="mt-4">
            <Link href="/projects/timesheets/new">Log Time</Link>
          </Button>
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Project</TableHead>
                  <TableHead>Task</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Hours</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell>
                      {format(new Date(entry.date), 'MMM d, yyyy')}
                    </TableCell>
                    <TableCell>
                      {entry.task?.project?.name || '-'}
                    </TableCell>
                    <TableCell className="font-medium">
                      {entry.task?.name || '-'}
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate">
                      {entry.description || '-'}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {formatHours(entry.hours)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={
                          entry.status === 'UNBILLED'
                            ? 'bg-yellow-100 text-yellow-800'
                            : 'bg-green-100 text-green-800'
                        }
                      >
                        {entry.status === 'UNBILLED' ? 'Unbilled' : 'Invoiced'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {entry.status === 'UNBILLED' && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-red-600"
                          onClick={() => setDeleteId(entry.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Time Entry</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this time entry? This action cannot
              be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
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
