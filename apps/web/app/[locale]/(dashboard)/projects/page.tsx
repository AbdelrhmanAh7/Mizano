'use client';

import { DataTable, DataTableSearch, SortableHeader } from '@/components/data-table';
import { BulkActionConfirmDialog } from '@/components/data-table/bulk-action-confirm';
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
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { projectsApi } from '@/lib/api';
import { useBulkAction } from '@/lib/hooks/use-bulk-action';
import { usePermissions } from '@/lib/hooks/use-permissions';
import {
  formatCurrency,
  formatHours,
  getBillingMethodLabel,
  getProjectStatusColor,
  getProjectStatusLabel,
  Project,
  ProjectStatus,
  useDeleteProject,
  useProjects,
} from '@/lib/hooks/use-projects';
import { useTableParams } from '@/lib/hooks/use-table-params';
import { type ColumnDef } from '@tanstack/react-table';
import { format } from 'date-fns';
import {
  Briefcase,
  CheckCircle,
  Clock,
  DollarSign,
  Eye,
  PauseCircle,
  Pencil,
  Play,
  Plus,
  Trash2,
  XCircle,
} from 'lucide-react';
import Link from 'next/link';
import { Suspense, useState } from 'react';
import { useTranslations } from 'next-intl';

function ProjectsPageContent() {
  const t = useTranslations('projects');
  const tableParams = useTableParams({ defaultSortBy: 'createdAt' });
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const { hasPermission } = usePermissions();

  const canEdit = hasPermission('projects.edit');
  const canDelete = hasPermission('projects.delete');

  const { data, isLoading } = useProjects({
    search: tableParams.search || undefined,
    status: statusFilter !== 'all' ? (statusFilter as ProjectStatus) : undefined,
  });

  const deleteProject = useDeleteProject();

  const projects: Project[] = data?.data || [];
  const meta = data?.meta;

  // Bulk action state
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkActivateOpen, setBulkActivateOpen] = useState(false);
  const [bulkCompleteOpen, setBulkCompleteOpen] = useState(false);
  const [bulkHoldOpen, setBulkHoldOpen] = useState(false);
  const [bulkCancelOpen, setBulkCancelOpen] = useState(false);
  const [bulkSelectedRows, setBulkSelectedRows] = useState<Project[]>([]);

  const bulkDeleteAction = useBulkAction({
    mutationFn: (ids) => projectsApi.bulkDelete(ids).then((r) => r.data),
    queryKeys: [['projects']],
    successMessage: '{count} projects deleted',
  });

  const bulkActivateAction = useBulkAction({
    mutationFn: (ids) => projectsApi.bulkActivate(ids).then((r) => r.data),
    queryKeys: [['projects']],
    successMessage: '{count} projects activated',
  });

  const bulkCompleteAction = useBulkAction({
    mutationFn: (ids) => projectsApi.bulkComplete(ids).then((r) => r.data),
    queryKeys: [['projects']],
    successMessage: '{count} projects completed',
  });

  const bulkHoldAction = useBulkAction({
    mutationFn: (ids) => projectsApi.bulkHold(ids).then((r) => r.data),
    queryKeys: [['projects']],
    successMessage: '{count} projects put on hold',
  });

  const bulkCancelAction = useBulkAction({
    mutationFn: (ids) => projectsApi.bulkCancel(ids).then((r) => r.data),
    queryKeys: [['projects']],
    successMessage: '{count} projects cancelled',
  });

  const bulkActions = [
    ...(canEdit
      ? [
          {
            label: 'Activate',
            icon: Play,
            onClick: (rows: Project[]) => {
              setBulkSelectedRows(rows);
              setBulkActivateOpen(true);
            },
          },
          {
            label: 'Complete',
            icon: CheckCircle,
            onClick: (rows: Project[]) => {
              setBulkSelectedRows(rows);
              setBulkCompleteOpen(true);
            },
          },
          {
            label: 'Put on Hold',
            icon: PauseCircle,
            onClick: (rows: Project[]) => {
              setBulkSelectedRows(rows);
              setBulkHoldOpen(true);
            },
          },
          {
            label: 'Cancel',
            icon: XCircle,
            variant: 'destructive' as const,
            onClick: (rows: Project[]) => {
              setBulkSelectedRows(rows);
              setBulkCancelOpen(true);
            },
          },
        ]
      : []),
    ...(canDelete
      ? [
          {
            label: 'Delete',
            icon: Trash2,
            variant: 'destructive' as const,
            onClick: (rows: Project[]) => {
              setBulkSelectedRows(rows);
              setBulkDeleteOpen(true);
            },
          },
        ]
      : []),
  ];

  const handleDelete = async () => {
    if (deleteId) {
      await deleteProject.mutateAsync(deleteId);
      setDeleteId(null);
    }
  };

  // Calculate totals
  const totalBudget = projects.reduce((sum, p) => {
    const budget = typeof p.budgetAmount === 'string' ? parseFloat(p.budgetAmount) : p.budgetAmount;
    return sum + (budget || 0);
  }, 0);

  const totalBilled = projects.reduce((sum, p) => {
    const billed = typeof p.totalBilled === 'string' ? parseFloat(p.totalBilled) : p.totalBilled;
    return sum + (billed || 0);
  }, 0);

  const columns: ColumnDef<Project>[] = [
    {
      accessorKey: 'name',
      header: () => (
        <SortableHeader
          label="Project"
          columnId="name"
          currentSortBy={tableParams.sortBy}
          currentSortOrder={tableParams.sortOrder}
          onSort={tableParams.setSort}
        />
      ),
      cell: ({ row }) => {
        const project = row.original;
        return (
          <div>
            <Link href={`/projects/${project.id}`} className="font-medium hover:underline">
              {project.name}
            </Link>
            {project.customer?.name && (
              <p className="text-sm text-muted-foreground">{project.customer.name}</p>
            )}
          </div>
        );
      },
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => (
        <Badge variant="outline" className={getProjectStatusColor(row.original.status)}>
          {getProjectStatusLabel(row.original.status)}
        </Badge>
      ),
    },
    {
      accessorKey: 'billingMethod',
      header: 'Billing',
      cell: ({ row }) => getBillingMethodLabel(row.original.billingMethod),
    },
    {
      accessorKey: 'totalHours',
      header: 'Hours',
      meta: { headerClassName: 'text-right', cellClassName: 'text-right' },
      cell: ({ row }) => <span className="font-mono">{formatHours(row.original.totalHours)}</span>,
    },
    {
      id: 'budget',
      header: 'Budget',
      meta: { headerClassName: 'text-right', cellClassName: 'text-right' },
      cell: ({ row }) => {
        const project = row.original;
        const budget =
          typeof project.budgetAmount === 'string'
            ? parseFloat(project.budgetAmount)
            : project.budgetAmount;
        const billed =
          typeof project.totalBilled === 'string'
            ? parseFloat(project.totalBilled)
            : project.totalBilled;
        const progress = budget > 0 ? Math.min((billed / budget) * 100, 100) : 0;

        return budget > 0 ? (
          <div className="min-w-[120px]">
            <div className="flex justify-between text-xs mb-1">
              <span>{formatCurrency(billed)}</span>
              <span className="text-muted-foreground">{formatCurrency(budget)}</span>
            </div>
            <Progress value={progress} className="h-1.5" />
          </div>
        ) : (
          <span className="text-muted-foreground">-</span>
        );
      },
    },
    {
      accessorKey: 'startDate',
      header: () => (
        <SortableHeader
          label="Started"
          columnId="startDate"
          currentSortBy={tableParams.sortBy}
          currentSortOrder={tableParams.sortOrder}
          onSort={tableParams.setSort}
        />
      ),
      cell: ({ row }) =>
        row.original.startDate ? format(new Date(row.original.startDate), 'MMM d, yyyy') : '-',
    },
    {
      id: 'actions',
      header: '',
      meta: { cellClassName: 'text-right' },
      cell: ({ row }) => {
        const project = row.original;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm">
                ...
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link href={`/projects/${project.id}`}>
                  <Eye className="mr-2 h-4 w-4" />
                  View
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href={`/projects/${project.id}/edit`}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem className="text-red-600" onClick={() => setDeleteId(project.id)}>
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
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
          <h1 className="text-3xl font-bold tracking-tight">{t('projects.title')}</h1>
          <p className="text-muted-foreground">{t('description')}</p>
        </div>
        <Button asChild>
          <Link href="/projects/new">
            <Plus className="mr-2 h-4 w-4" />
            {t('projects.newProject')}
          </Link>
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Briefcase className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Active Projects</p>
                <p className="text-2xl font-bold">
                  {projects.filter((p) => p.status === 'ACTIVE').length}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <DollarSign className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Budget</p>
                <p className="text-2xl font-bold font-mono">{formatCurrency(totalBudget)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 rounded-lg">
                <Clock className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Billed</p>
                <p className="text-2xl font-bold font-mono">{formatCurrency(totalBilled)}</p>
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
              placeholder="Search projects..."
            />
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-36">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="PLANNING">Planning</SelectItem>
                <SelectItem value="ACTIVE">Active</SelectItem>
                <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
                <SelectItem value="COMPLETED">Completed</SelectItem>
                <SelectItem value="ON_HOLD">On Hold</SelectItem>
                <SelectItem value="CANCELLED">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Projects Table */}
      <Card>
        <CardHeader>
          <CardTitle>{t('projects.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            data={projects}
            page={meta?.page || 1}
            totalPages={meta?.totalPages || 1}
            total={meta?.total || 0}
            limit={tableParams.limit}
            onPageChange={tableParams.setPage}
            onLimitChange={tableParams.setLimit}
            isLoading={isLoading}
            enableSelection
            bulkActions={bulkActions}
            emptyMessage={t('projects.empty.title')}
            emptyAction={
              <Button asChild>
                <Link href="/projects/new">
                  <Plus className="mr-2 h-4 w-4" />
                  {t('projects.newProject')}
                </Link>
              </Button>
            }
          />
        </CardContent>
      </Card>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('projects.deleteProject')}</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this project? All tasks and time entries will also be
              deleted. This action cannot be undone.
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

      {/* Bulk Action Dialogs */}
      <BulkActionConfirmDialog
        open={bulkDeleteOpen}
        onOpenChange={setBulkDeleteOpen}
        action="delete"
        count={bulkSelectedRows.length}
        itemType="projects"
        description="Projects without timesheets or invoices will be deleted."
        destructive
        isLoading={bulkDeleteAction.isLoading}
        onConfirm={async () => {
          await bulkDeleteAction.execute(bulkSelectedRows.map((r) => r.id));
          setBulkDeleteOpen(false);
        }}
      />
      <BulkActionConfirmDialog
        open={bulkActivateOpen}
        onOpenChange={setBulkActivateOpen}
        action="activate"
        count={bulkSelectedRows.length}
        itemType="projects"
        description="Selected projects will be set to active status."
        isLoading={bulkActivateAction.isLoading}
        onConfirm={async () => {
          await bulkActivateAction.execute(bulkSelectedRows.map((r) => r.id));
          setBulkActivateOpen(false);
        }}
      />
      <BulkActionConfirmDialog
        open={bulkCompleteOpen}
        onOpenChange={setBulkCompleteOpen}
        action="complete"
        count={bulkSelectedRows.length}
        itemType="projects"
        description="Active projects will be marked as completed."
        isLoading={bulkCompleteAction.isLoading}
        onConfirm={async () => {
          await bulkCompleteAction.execute(bulkSelectedRows.map((r) => r.id));
          setBulkCompleteOpen(false);
        }}
      />
      <BulkActionConfirmDialog
        open={bulkHoldOpen}
        onOpenChange={setBulkHoldOpen}
        action="put on hold"
        count={bulkSelectedRows.length}
        itemType="projects"
        description="Active projects will be put on hold."
        isLoading={bulkHoldAction.isLoading}
        onConfirm={async () => {
          await bulkHoldAction.execute(bulkSelectedRows.map((r) => r.id));
          setBulkHoldOpen(false);
        }}
      />
      <BulkActionConfirmDialog
        open={bulkCancelOpen}
        onOpenChange={setBulkCancelOpen}
        action="cancel"
        count={bulkSelectedRows.length}
        itemType="projects"
        description="Selected projects will be cancelled."
        destructive
        isLoading={bulkCancelAction.isLoading}
        onConfirm={async () => {
          await bulkCancelAction.execute(bulkSelectedRows.map((r) => r.id));
          setBulkCancelOpen(false);
        }}
      />
    </div>
  );
}

export default function ProjectsPage() {
  return (
    <Suspense>
      <ProjectsPageContent />
    </Suspense>
  );
}
