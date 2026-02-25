'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { Plus, Clock, Calendar, Trash2 } from 'lucide-react';
import { type ColumnDef } from '@tanstack/react-table';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { DataTable, DataTableSearch, SortableHeader } from '@/components/data-table';
import { useTableParams } from '@/lib/hooks/use-table-params';
import {
  useTimesheets,
  useDeleteTimesheet,
  formatHours,
  TimesheetEntry,
} from '@/lib/hooks/use-projects';

function TimesheetsPageContent() {
  const tableParams = useTableParams({ defaultSortBy: 'date' });

  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data, isLoading } = useTimesheets({
    ...tableParams.queryParams,
    status: statusFilter !== 'all' ? (statusFilter as 'UNBILLED' | 'INVOICED') : undefined,
  });

  const deleteTimesheet = useDeleteTimesheet();

  const entries: TimesheetEntry[] = data?.data || [];
  const meta = data?.meta;

  const handleDelete = async () => {
    if (deleteId) {
      await deleteTimesheet.mutateAsync(deleteId);
      setDeleteId(null);
    }
  };

  // Calculate totals from current page data
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

  const columns: ColumnDef<TimesheetEntry>[] = [
    {
      accessorKey: 'date',
      header: () => (
        <SortableHeader
          label="Date"
          columnId="date"
          currentSortBy={tableParams.sortBy}
          currentSortOrder={tableParams.sortOrder}
          onSort={tableParams.setSort}
        />
      ),
      cell: ({ row }) => format(new Date(row.original.date), 'MMM d, yyyy'),
    },
    {
      accessorKey: 'task.project.name',
      header: 'Project',
      cell: ({ row }) => row.original.task?.project?.name || '-',
    },
    {
      accessorKey: 'task.name',
      header: 'Task',
      cell: ({ row }) => <span className="font-medium">{row.original.task?.name || '-'}</span>,
    },
    {
      accessorKey: 'description',
      header: 'Description',
      meta: { cellClassName: 'max-w-[200px] truncate' },
      cell: ({ row }) => row.original.description || '-',
    },
    {
      accessorKey: 'hours',
      header: () => (
        <SortableHeader
          label="Hours"
          columnId="hours"
          currentSortBy={tableParams.sortBy}
          currentSortOrder={tableParams.sortOrder}
          onSort={tableParams.setSort}
        />
      ),
      meta: { headerClassName: 'text-right', cellClassName: 'text-right font-mono' },
      cell: ({ row }) => formatHours(row.original.hours),
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => (
        <Badge
          variant="outline"
          className={
            row.original.status === 'UNBILLED'
              ? 'bg-yellow-100 text-yellow-800'
              : 'bg-green-100 text-green-800'
          }
        >
          {row.original.status === 'UNBILLED' ? 'Unbilled' : 'Invoiced'}
        </Badge>
      ),
    },
    {
      id: 'actions',
      header: '',
      meta: { cellClassName: 'w-12' },
      cell: ({ row }) => {
        const entry = row.original;
        return entry.status === 'UNBILLED' ? (
          <Button
            variant="ghost"
            size="icon"
            className="text-red-600"
            onClick={() => setDeleteId(entry.id)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        ) : null;
      },
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Timesheets</h1>
          <p className="text-muted-foreground">Track time spent on projects and tasks</p>
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
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <DataTableSearch
              value={tableParams.search}
              onChange={tableParams.setSearch}
              placeholder="Search entries..."
            />
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
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle>Time Entries</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            data={entries}
            page={meta?.page || 1}
            totalPages={meta?.totalPages || 1}
            total={meta?.total || 0}
            limit={tableParams.limit}
            onPageChange={tableParams.setPage}
            onLimitChange={tableParams.setLimit}
            isLoading={isLoading}
            emptyMessage="No time entries found"
            emptyAction={
              <Button asChild>
                <Link href="/projects/timesheets/new">Log Time</Link>
              </Button>
            }
          />
        </CardContent>
      </Card>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Time Entry</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this time entry? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default function TimesheetsPage() {
  return (
    <Suspense>
      <TimesheetsPageContent />
    </Suspense>
  );
}
