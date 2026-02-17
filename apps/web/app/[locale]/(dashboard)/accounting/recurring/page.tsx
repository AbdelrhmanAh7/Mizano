'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { Plus, RefreshCw, Eye, Edit, Trash2, Play, Pause, Calendar } from 'lucide-react';
import { type ColumnDef } from '@tanstack/react-table';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { useToast } from '@/components/ui/use-toast';
import { DataTable, DataTableSearch, SortableHeader } from '@/components/data-table';
import { useTableParams } from '@/lib/hooks/use-table-params';
import {
  useRecurringProfiles,
  useDeleteRecurringProfile,
  useToggleRecurringProfile,
  RecurringProfile,
  getFrequencyLabel,
} from '@/lib/hooks/use-recurring-profiles';
import { usePermissions } from '@/lib/hooks/use-permissions';
import { format } from 'date-fns';

function RecurringProfilesPageContent() {
  const { toast } = useToast();
  const { hasPermission } = usePermissions();
  const tableParams = useTableParams({ defaultSortBy: 'nextExecutionDate' });

  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [profileToDelete, setProfileToDelete] = useState<RecurringProfile | null>(null);

  const {
    data: profilesData,
    isLoading,
    refetch,
  } = useRecurringProfiles({
    ...tableParams.queryParams,
    isActive: selectedStatus === 'all' ? undefined : selectedStatus === 'active',
  });
  const deleteProfile = useDeleteRecurringProfile();
  const toggleProfile = useToggleRecurringProfile();

  const profiles = profilesData?.data || [];
  const meta = profilesData?.meta;

  const canCreate = hasPermission('accounting.create');
  const canEdit = hasPermission('accounting.edit');
  const canDelete = hasPermission('accounting.delete');

  const handleDelete = (profile: RecurringProfile) => {
    setProfileToDelete(profile);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (profileToDelete) {
      try {
        await deleteProfile.mutateAsync(profileToDelete.id);
        toast({
          title: 'Profile deleted',
          description: `Recurring profile "${profileToDelete.name}" has been deleted.`,
        });
      } catch (error) {
        toast({
          title: 'Error',
          description: 'Failed to delete recurring profile.',
          variant: 'destructive',
        });
      }
      setDeleteDialogOpen(false);
      setProfileToDelete(null);
    }
  };

  const handleToggle = async (profile: RecurringProfile) => {
    try {
      await toggleProfile.mutateAsync(profile.id);
      toast({
        title: profile.isActive ? 'Profile paused' : 'Profile activated',
        description: `"${profile.name}" has been ${profile.isActive ? 'paused' : 'activated'}.`,
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to toggle recurring profile.',
        variant: 'destructive',
      });
    }
  };

  const columns: ColumnDef<RecurringProfile>[] = [
    {
      accessorKey: 'name',
      header: () => (
        <SortableHeader
          label="Name"
          columnId="name"
          currentSortBy={tableParams.sortBy}
          currentSortOrder={tableParams.sortOrder}
          onSort={tableParams.setSort}
        />
      ),
      cell: ({ row }) => (
        <div>
          <span className="font-medium">{row.original.name}</span>
          {row.original.description && (
            <p className="text-sm text-muted-foreground truncate max-w-[200px]">
              {row.original.description}
            </p>
          )}
        </div>
      ),
    },
    {
      accessorKey: 'frequency',
      header: 'Frequency',
      cell: ({ row }) => (
        <Badge variant="outline">{getFrequencyLabel(row.original.frequency)}</Badge>
      ),
    },
    {
      accessorKey: 'nextExecutionDate',
      header: () => (
        <SortableHeader
          label="Next Execution"
          columnId="nextExecutionDate"
          currentSortBy={tableParams.sortBy}
          currentSortOrder={tableParams.sortOrder}
          onSort={tableParams.setSort}
        />
      ),
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          {format(new Date(row.original.nextExecutionDate), 'MMM d, yyyy')}
        </div>
      ),
    },
    {
      accessorKey: 'autoPost',
      header: 'Auto Post',
      cell: ({ row }) => (
        <Badge variant={row.original.autoPost ? 'default' : 'secondary'}>
          {row.original.autoPost ? 'Yes' : 'No'}
        </Badge>
      ),
    },
    {
      accessorKey: 'isActive',
      header: 'Status',
      cell: ({ row }) => (
        <Badge
          className={
            row.original.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
          }
        >
          {row.original.isActive ? 'Active' : 'Inactive'}
        </Badge>
      ),
    },
    {
      id: 'actions',
      header: '',
      meta: { cellClassName: 'text-right' },
      cell: ({ row }) => {
        const profile = row.original;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm">
                ...
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link href={`/accounting/recurring/${profile.id}`}>
                  <Eye className="mr-2 h-4 w-4" />
                  View
                </Link>
              </DropdownMenuItem>
              {canEdit && (
                <>
                  <DropdownMenuItem asChild>
                    <Link href={`/accounting/recurring/${profile.id}/edit`}>
                      <Edit className="mr-2 h-4 w-4" />
                      Edit
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleToggle(profile)}>
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
                  </DropdownMenuItem>
                </>
              )}
              {canDelete && (
                <DropdownMenuItem onClick={() => handleDelete(profile)} className="text-red-600">
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Recurring Journals</h1>
          <p className="text-muted-foreground">Automate journal entries with recurring profiles</p>
        </div>
        <div className="flex items-center gap-2">
          {canCreate && (
            <Button asChild>
              <Link href="/accounting/recurring/new">
                <Plus className="mr-2 h-4 w-4" />
                New Profile
              </Link>
            </Button>
          )}
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <DataTableSearch
              value={tableParams.search}
              onChange={tableParams.setSearch}
              placeholder="Search by name or description..."
            />
            <Select value={selectedStatus} onValueChange={setSelectedStatus}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Profiles</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="icon"
              onClick={() => refetch()}
              aria-label="Refresh recurring profiles"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Profiles Table */}
      <Card>
        <CardHeader>
          <CardTitle>Recurring Profiles</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            data={profiles}
            page={meta?.page || 1}
            totalPages={meta?.totalPages || 1}
            total={meta?.total || 0}
            limit={tableParams.limit}
            onPageChange={tableParams.setPage}
            onLimitChange={tableParams.setLimit}
            isLoading={isLoading}
            emptyMessage="No recurring profiles found"
            emptyAction={
              canCreate ? (
                <Button asChild>
                  <Link href="/accounting/recurring/new">
                    <Plus className="mr-2 h-4 w-4" />
                    Create Your First Profile
                  </Link>
                </Button>
              ) : undefined
            }
          />
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Recurring Profile</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{profileToDelete?.name}&quot;? This action
              cannot be undone. Previously created journals will not be affected.
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

export default function RecurringProfilesPage() {
  return (
    <Suspense>
      <RecurringProfilesPageContent />
    </Suspense>
  );
}
