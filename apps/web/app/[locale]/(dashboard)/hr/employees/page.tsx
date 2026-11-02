'use client';

import { DataTable, DataTableSearch, SortableHeader } from '@/components/data-table';
import { DeleteConfirmDialog } from '@/components/shared/delete-confirm-dialog';
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
import { useDateFnsLocale } from '@/lib/date-locale';
import { useMoneyFormatter } from '@/lib/hooks/use-money-formatter';

function EmployeesPageContent() {
  const formatCurrency = useMoneyFormatter();
  const t = useTranslations('hr');
  const tCommon = useTranslations('common');
  const dateLocale = useDateFnsLocale();
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
    isError,
    refetch,
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
            <p className="text-sm text-muted-foreground">{employee.jobTitle || t('noTitle')}</p>
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
      cell: ({ row }) => (row.original.phone ? <span dir="ltr">{row.original.phone}</span> : '-'),
    },
    {
      accessorKey: 'status',
      header: t('employees.table.status'),
      cell: ({ row }) => (
        <Badge variant="outline" className={getEmployeeStatusColor(row.original.status)}>
          {getEmployeeStatusLabel(row.original.status, t)}
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
        row.original.dateOfJoining
          ? format(new Date(row.original.dateOfJoining), 'MMM yyyy', { locale: dateLocale })
          : '-',
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
      meta: { headerClassName: 'text-end', cellClassName: 'text-end' },
      cell: ({ row }) => (
        <span className="font-mono font-medium">
          {t('employees.perMonth', { amount: formatCurrency(row.original.basicSalary) })}
        </span>
      ),
    },
    {
      id: 'actions',
      header: '',
      meta: { cellClassName: 'text-end' },
      cell: ({ row }) => {
        const employee = row.original;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" aria-label={t('employees.rowActions')}>
                ...
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link href={`/hr/employees/${employee.id}`}>
                  <Eye className="me-2 h-4 w-4" />
                  {tCommon('buttons.view')}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href={`/hr/employees/${employee.id}/edit`}>
                  <Pencil className="me-2 h-4 w-4" />
                  {tCommon('buttons.edit')}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive"
                onClick={() => setDeleteId(employee.id)}
              >
                <Trash2 className="me-2 h-4 w-4" />
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
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('employees.title')}</h1>
          <p className="text-muted-foreground">{t('employees.description')}</p>
        </div>
        <Button asChild>
          <Link href="/hr/employees/new">
            <Plus className="me-2 h-4 w-4" />
            {t('employees.newEmployee')}
          </Link>
        </Button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-info/10 rounded-lg">
                <UserCircle className="h-5 w-5 text-info" />
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
          {isError ? (
            <div className="py-8 text-center space-y-4" role="alert">
              <p className="text-sm text-muted-foreground">{tCommon('table.error')}</p>
              <Button variant="outline" onClick={() => void refetch()}>
                {t('retry')}
              </Button>
            </div>
          ) : (
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
                    <Plus className="me-2 h-4 w-4" />
                    {t('employees.newEmployee')}
                  </Link>
                </Button>
              }
            />
          )}
        </CardContent>
      </Card>

      {/* Delete Confirmation */}
      <DeleteConfirmDialog
        open={!!deleteId}
        onOpenChange={() => setDeleteId(null)}
        title={t('employees.deleteEmployee')}
        description={tCommon('confirm.deleteMessage')}
        onConfirm={handleDelete}
      />
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
