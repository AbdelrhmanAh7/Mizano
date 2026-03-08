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
      accessorKey: 'firstName',
      header: () => (
        <SortableHeader
          label="Name"
          columnId="firstName"
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
              {employee.firstName} {employee.lastName}
            </Link>
            <p className="text-sm text-muted-foreground">{employee.jobTitle || 'No title'}</p>
          </div>
        );
      },
    },
    {
      accessorKey: 'email',
      header: 'Email',
      cell: ({ row }) => row.original.email || '-',
    },
    {
      accessorKey: 'phone',
      header: 'Phone',
      cell: ({ row }) => row.original.phone || '-',
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => (
        <Badge variant="outline" className={getEmployeeStatusColor(row.original.status)}>
          {getEmployeeStatusLabel(row.original.status)}
        </Badge>
      ),
    },
    {
      accessorKey: 'joiningDate',
      header: () => (
        <SortableHeader
          label="Joined"
          columnId="joiningDate"
          currentSortBy={tableParams.sortBy}
          currentSortOrder={tableParams.sortOrder}
          onSort={tableParams.setSort}
        />
      ),
      cell: ({ row }) => format(new Date(row.original.joiningDate), 'MMM yyyy'),
    },
    {
      accessorKey: 'basicSalary',
      header: () => (
        <SortableHeader
          label="Salary"
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
                  View
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href={`/hr/employees/${employee.id}/edit`}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem className="text-red-600" onClick={() => setDeleteId(employee.id)}>
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
          <h1 className="text-3xl font-bold tracking-tight">{t('employees.title')}</h1>
          <p className="text-muted-foreground">Manage your team members and their information</p>
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
                <p className="text-sm text-muted-foreground">Active Employees</p>
                <p className="text-2xl font-bold">{activeCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Monthly Payroll</p>
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
              placeholder="Search employees..."
            />
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-36">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="ACTIVE">Active</SelectItem>
                <SelectItem value="INACTIVE">Inactive</SelectItem>
                <SelectItem value="TERMINATED">Terminated</SelectItem>
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
            <AlertDialogDescription>
              Are you sure you want to delete this employee? This action cannot be undone.
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

export default function EmployeesPage() {
  return (
    <Suspense>
      <EmployeesPageContent />
    </Suspense>
  );
}
