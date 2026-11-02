'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import {
  Plus,
  RefreshCw,
  Eye,
  Edit,
  Trash2,
  Play,
  Pause,
  Calendar,
  Activity,
  Clock,
  CheckCircle,
} from 'lucide-react';
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
import { DeleteConfirmDialog } from '@/components/shared/delete-confirm-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { DataTable, DataTableSearch, SortableHeader } from '@/components/data-table';
import { useTableParams } from '@/lib/hooks/use-table-params';
import {
  useRecurringProfiles,
  useDeleteRecurringProfile,
  useToggleRecurringProfile,
  useExecuteRecurringProfile,
  useRecurringProfileStatistics,
  RecurringProfile,
  useFrequencyLabel,
} from '@/lib/hooks/use-recurring-profiles';
import { usePermissions } from '@/lib/hooks/use-permissions';
import { format } from 'date-fns';
import { useTranslations } from 'next-intl';
import { useDateFnsLocale } from '@/lib/date-locale';

function RecurringProfilesPageContent() {
  const dateLocale = useDateFnsLocale();
  const t = useTranslations('accounting');
  const tPage = useTranslations('accounting.recurring.page');
  const frequencyLabel = useFrequencyLabel();
  const { hasPermission } = usePermissions();
  const tableParams = useTableParams({ defaultSortBy: 'nextRunDate' });

  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [profileToDelete, setProfileToDelete] = useState<RecurringProfile | null>(null);

  const {
    data: profilesData,
    isLoading,
    isError,
    refetch,
  } = useRecurringProfiles({
    ...tableParams.queryParams,
    isActive: selectedStatus === 'all' ? undefined : selectedStatus === 'active',
  });
  const deleteProfile = useDeleteRecurringProfile();
  const toggleProfile = useToggleRecurringProfile();
  const executeProfile = useExecuteRecurringProfile();
  const { data: statistics } = useRecurringProfileStatistics();

  const profiles = profilesData?.data || [];
  const meta = profilesData?.meta;

  const canCreate = hasPermission('accounting.create');
  const canEdit = hasPermission('accounting.edit');
  const canDelete = hasPermission('accounting.delete');

  const handleDelete = (profile: RecurringProfile) => {
    setProfileToDelete(profile);
    setDeleteDialogOpen(true);
  };

  // The mutation hooks show the success and error toasts.
  const confirmDelete = async () => {
    if (profileToDelete) {
      try {
        await deleteProfile.mutateAsync(profileToDelete.id);
      } catch {
        // Toasted by useDeleteRecurringProfile.
      }
      setDeleteDialogOpen(false);
      setProfileToDelete(null);
    }
  };

  const handleExecute = (profile: RecurringProfile) => {
    executeProfile.mutate(profile.id);
  };

  const handleToggle = (profile: RecurringProfile) => {
    toggleProfile.mutate(profile.id);
  };

  const columns: ColumnDef<RecurringProfile>[] = [
    {
      accessorKey: 'name',
      header: () => (
        <SortableHeader
          label={t('recurring.table.name')}
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
      header: t('recurring.table.frequency'),
      cell: ({ row }) => <Badge variant="outline">{frequencyLabel(row.original.frequency)}</Badge>,
    },
    {
      accessorKey: 'nextRunDate',
      header: () => (
        <SortableHeader
          label={t('recurring.table.nextRun')}
          columnId="nextRunDate"
          currentSortBy={tableParams.sortBy}
          currentSortOrder={tableParams.sortOrder}
          onSort={tableParams.setSort}
        />
      ),
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          {format(new Date(row.original.nextRunDate), 'PP', { locale: dateLocale })}
        </div>
      ),
    },
    {
      accessorKey: 'autoPost',
      header: t('recurring.form.autoPost'),
      cell: ({ row }) => (
        <Badge variant={row.original.autoPost ? 'default' : 'secondary'}>
          {row.original.autoPost ? tPage('yes') : tPage('no')}
        </Badge>
      ),
    },
    {
      accessorKey: 'isActive',
      header: t('recurring.table.status'),
      cell: ({ row }) => (
        <Badge
          className={
            row.original.isActive ? 'bg-success/10 text-success' : 'bg-muted text-foreground'
          }
        >
          {row.original.isActive ? tPage('active') : tPage('inactive')}
        </Badge>
      ),
    },
    {
      id: 'actions',
      header: '',
      meta: { cellClassName: 'text-end' },
      cell: ({ row }) => {
        const profile = row.original;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                aria-label={tPage('actions', { name: profile.name })}
              >
                ...
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link href={`/accounting/recurring/${profile.id}`}>
                  <Eye className="me-2 h-4 w-4" />
                  {tPage('view')}
                </Link>
              </DropdownMenuItem>
              {canEdit && (
                <>
                  <DropdownMenuItem asChild>
                    <Link href={`/accounting/recurring/${profile.id}/edit`}>
                      <Edit className="me-2 h-4 w-4" />
                      {tPage('edit')}
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleExecute(profile)}>
                    <Play className="me-2 h-4 w-4" />
                    {tPage('executeNow')}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleToggle(profile)}>
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
                  </DropdownMenuItem>
                </>
              )}
              {canDelete && (
                <DropdownMenuItem
                  onClick={() => handleDelete(profile)}
                  className="text-destructive"
                >
                  <Trash2 className="me-2 h-4 w-4" />
                  {tPage('delete')}
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
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('recurring.title')}</h1>
          <p className="text-muted-foreground">{tPage('description')}</p>
        </div>
        <div className="flex items-center gap-2">
          {canCreate && (
            <Button asChild>
              <Link href="/accounting/recurring/new">
                <Plus className="me-2 h-4 w-4" />
                {t('recurring.newProfile')}
              </Link>
            </Button>
          )}
        </div>
      </div>

      {/* Statistics Cards */}
      {statistics && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{tPage('totalProfiles')}</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{statistics.total ?? 0}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{tPage('activeProfiles')}</CardTitle>
              <CheckCircle className="h-4 w-4 text-success" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-success">{statistics.active ?? 0}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{tPage('pausedProfiles')}</CardTitle>
              <Pause className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{statistics.paused ?? 0}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{tPage('dueThisWeek')}</CardTitle>
              <Clock className="h-4 w-4 text-warning" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-warning">{statistics.dueThisWeek ?? 0}</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <DataTableSearch
              value={tableParams.search}
              onChange={tableParams.setSearch}
              placeholder={tPage('searchPlaceholder')}
            />
            <Select value={selectedStatus} onValueChange={setSelectedStatus}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder={tPage('filterByStatus')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{tPage('allProfiles')}</SelectItem>
                <SelectItem value="active">{tPage('active')}</SelectItem>
                <SelectItem value="inactive">{tPage('inactive')}</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="icon"
              onClick={() => refetch()}
              aria-label={tPage('refresh')}
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Profiles Table */}
      <Card>
        <CardHeader>
          <CardTitle>{t('recurring.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          {isError ? (
            <div className="py-12 text-center text-muted-foreground" role="alert">
              <p>{tPage('loadError')}</p>
              <Button variant="outline" className="mt-4" onClick={() => void refetch()}>
                {tPage('retry')}
              </Button>
            </div>
          ) : (
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
              emptyMessage={t('recurring.empty.title')}
              emptyAction={
                canCreate ? (
                  <Button asChild>
                    <Link href="/accounting/recurring/new">
                      <Plus className="me-2 h-4 w-4" />
                      {tPage('createFirst')}
                    </Link>
                  </Button>
                ) : undefined
              }
            />
          )}
        </CardContent>
      </Card>

      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title={t('recurring.deleteProfile')}
        description={tPage('deleteConfirm', { name: profileToDelete?.name ?? '' })}
        onConfirm={confirmDelete}
        cancelLabel={tPage('cancel')}
        deleteLabel={tPage('delete')}
      />
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
