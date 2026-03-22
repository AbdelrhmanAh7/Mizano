'use client';

import { FlightRiskCard } from '@/components/ai';
import { DataTable, DataTableSearch, SortableHeader } from '@/components/data-table';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useExportAll } from '@/lib/hooks/use-export-all';
import {
  Employee,
  formatCurrency,
  getEmployeeStatusColor,
  getEmployeeStatusLabel,
  useDeleteEmployee,
  useInfiniteEmployees,
} from '@/lib/hooks/use-hr';
import { useTableParams } from '@/lib/hooks/use-table-params';
import { type ColumnDef } from '@tanstack/react-table';
import { format } from 'date-fns';
import { Eye, Pencil, Plus, Trash2, UserCircle } from 'lucide-react';
import Link from 'next/link';
import { Suspense, useState } from 'react';
import { useTranslations } from 'next-intl';

function EmployeesPageContent() {
  const t = useTranslations('hr');
  const tCommon = useTranslations('common');
  const tableParams = useTableParams({ defaultSortBy: 'createdAt', mode: 'virtual' });
  const { onExportAll } = useExportAll('employees', 'employees');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const {
    data: employees,
    total,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
    isLoading,
  } = useInfiniteEmployees({
    ...tableParams.queryParams,
    status: statusFilter !== 'all' ? statusFilter : undefined,
  });

  const deleteEmployee = useDeleteEmployee();

  const handleDelete = async () => {
    if (deleteId) {
      await deleteEmployee.mutateAsync(deleteId);
      setDeleteId(null);
    }
  };

  // Calculate totals
  const activeCount = employees.filter((e) => e.status === 'ACTIVE').length;
  const totalSalary = employees
    .filter((e) => e.status === 'ACTIVE')
    .reduce((sum, e) => {
      const salary = typeof e.basicSalary === 'string' ? parseFloat(e.basicSalary) : e.basicSalary;
      return sum + (salary || 0);
    }, 0);

  const columns: ColumnDef<Employee>[] = [
    {
      accessorKey: 'name',
      header: () => (
        <SortableHeader
          label={t('employees.table.name')}
          columnId="name"
          currentSortBy={tableParams.sortBy}
          currentSortOrder={tableParams.sortOrder}
          onSort={tableParams.setSort}
        />
      ),
      cell: ({ row }) => {
        const employee = row.original;
        return (
          <div>
            <Link href={`/hr/employees/${employee.id}`} className="font-medium hover:underline">
              {employee.name}
            </Link>
            <p className="text-sm text-muted-foreground">{employee.jobTitle || 'No title'}</p>
          </div>
        );
      },
    },
    {
      accessorKey: 'email',
      header: t('employees.table.email'),
      cell: ({ row }) => row.original.email || '-',
    },
    {
      accessorKey: 'phone',
      header: t('employees.table.phone'),
      cell: ({ row }) => row.original.phone || '-',
    },
    {
      accessorKey: 'status',
      header: t('employees.table.status'),
      cell: ({ row }) => (
        <Badge variant="outline" className={getEmployeeStatusColor(row.original.status)}>
          {getEmployeeStatusLabel(row.original.status)}
        </Badge>
      ),
    },
    {
      accessorKey: 'dateOfJoining',
      header: () => (
        <SortableHeader
          label={t('employees.table.joinedDate')}
          columnId="dateOfJoining"
          currentSortBy={tableParams.sortBy}
          currentSortOrder={tableParams.sortOrder}
          onSort={tableParams.setSort}
        />
      ),
      cell: ({ row }) =>
        row.original.dateOfJoining ? format(new Date(row.original.dateOfJoining), 'MMM yyyy') : '-',
    },
    {
      accessorKey: 'basicSalary',
      header: () => (
        <SortableHeader
          label={t('employees.table.salary')}
          columnId="basicSalary"
          currentSortBy={tableParams.sortBy}
          currentSortOrder={tableParams.sortOrder}
          onSort={tableParams.setSort}
        />
      ),
      meta: { headerClassName: 'text-right', cellClassName: 'text-right' },
      cell: ({ row }) => (
        <span className="font-mono font-medium">{formatCurrency(row.original.basicSalary)}/mo</span>
      ),
    },
    {
      id: 'actions',
      header: '',
      meta: { cellClassName: 'text-right' },
      cell: ({ row }) => {
        const employee = row.original;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm">
                ...
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link href={`/hr/employees/${employee.id}`}>
                  <Eye className="mr-2 h-4 w-4" />
                  {tCommon('buttons.view')}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href={`/hr/employees/${employee.id}/edit`}>
                  <Pencil className="mr-2 h-4 w-4" />
                  {tCommon('buttons.edit')}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem className="text-red-600" onClick={() => setDeleteId(employee.id)}>
                <Trash2 className="mr-2 h-4 w-4" />
                {tCommon('buttons.delete')}
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
          <h1 className="text-3xl font-bold tracking-tight">{t('employees.title')}</h1>
          <p className="text-muted-foreground">{t('employees.description')}</p>
        </div>
        <Button asChild>
          <Link href="/hr/employees/new">
            <Plus className="mr-2 h-4 w-4" />
            {t('employees.newEmployee')}
          </Link>
        </Button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <UserCircle className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t('employees.activeEmployees')}</p>
                <p className="text-2xl font-bold">{activeCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">{t('employees.totalPayroll')}</p>
            <p className="text-2xl font-bold font-mono">{formatCurrency(totalSalary)}</p>
          </CardContent>
        </Card>
      </div>

      {/* AI Flight Risk */}
      <FlightRiskCard />

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <DataTableSearch
              value={tableParams.search}
              onChange={tableParams.setSearch}
              placeholder={t('employees.searchPlaceholder')}
            />
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-36">
                <SelectValue placeholder={t('employees.allStatus')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('employees.allStatus')}</SelectItem>
                <SelectItem value="ACTIVE">{t('employees.status.active')}</SelectItem>
                <SelectItem value="INACTIVE">{t('employees.status.inactive')}</SelectItem>
                <SelectItem value="TERMINATED">{t('employees.status.terminated')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Employees Table */}
      <Card>
        <CardHeader>
          <CardTitle>{t('employees.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            data={employees}
            total={total}
            isLoading={isLoading}
            enableVirtualization
            hasNextPage={hasNextPage}
            isFetchingNextPage={isFetchingNextPage}
            onLoadMore={() => fetchNextPage()}
            enableColumnResizing
            tableId="employees"
            onExportAll={onExportAll}
            emptyMessage={t('employees.empty.title')}
            emptyAction={
              <Button asChild>
                <Link href="/hr/employees/new">
                  <Plus className="mr-2 h-4 w-4" />
                  {t('employees.newEmployee')}
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
            <AlertDialogTitle>{t('employees.deleteEmployee')}</AlertDialogTitle>
            <AlertDialogDescription>{tCommon('confirm.deleteMessage')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tCommon('buttons.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
              {tCommon('buttons.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default function EmployeesPage() {
  return (
    <Suspense>
      <EmployeesPageContent />
    </Suspense>
  );
}
