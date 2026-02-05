'use client';

import { useState } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { Plus, Search, MoreHorizontal, Eye, Pencil, Trash2, UserCircle, Mail, Phone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useEmployees,
  useDeleteEmployee,
  getEmployeeStatusLabel,
  getEmployeeStatusColor,
  formatCurrency,
  Employee,
  EmployeeStatus,
} from '@/lib/hooks/use-hr';

export default function EmployeesPage() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data, isLoading } = useEmployees({
    search,
    status: statusFilter !== 'all' ? statusFilter : undefined,
  });

  const deleteEmployee = useDeleteEmployee();

  const employees: Employee[] = data?.data || [];

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

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-10 w-32" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Employees</h1>
          <p className="text-muted-foreground">
            Manage your team members and their information
          </p>
        </div>
        <Button asChild>
          <Link href="/hr/employees/new">
            <Plus className="mr-2 h-4 w-4" />
            Add Employee
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

      {/* Filters */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search employees..."
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
            <SelectItem value="ACTIVE">Active</SelectItem>
            <SelectItem value="INACTIVE">Inactive</SelectItem>
            <SelectItem value="TERMINATED">Terminated</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Employee Grid */}
      {employees.length === 0 ? (
        <div className="text-center py-12">
          <UserCircle className="mx-auto h-12 w-12 text-muted-foreground" />
          <h3 className="mt-4 text-lg font-semibold">No employees found</h3>
          <p className="text-muted-foreground">
            Add your first employee to get started.
          </p>
          <Button asChild className="mt-4">
            <Link href="/hr/employees/new">Add Employee</Link>
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {employees.map((employee) => (
            <Card key={employee.id}>
              <CardContent className="pt-6">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-12 w-12">
                      <AvatarFallback className="bg-primary/10 text-primary">
                        {employee.firstName[0]}
                        {employee.lastName[0]}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <Link
                        href={`/hr/employees/${employee.id}`}
                        className="font-medium hover:text-blue-600 hover:underline"
                      >
                        {employee.firstName} {employee.lastName}
                      </Link>
                      <p className="text-sm text-muted-foreground">
                        {employee.jobTitle || 'No title'}
                      </p>
                      <Badge
                        variant="outline"
                        className={getEmployeeStatusColor(employee.status)}
                      >
                        {getEmployeeStatusLabel(employee.status)}
                      </Badge>
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon">
                        <MoreHorizontal className="h-4 w-4" />
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
                      <DropdownMenuItem
                        className="text-red-600"
                        onClick={() => setDeleteId(employee.id)}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                <div className="mt-4 space-y-2">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Mail className="h-4 w-4" />
                    {employee.email}
                  </div>
                  {employee.phone && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Phone className="h-4 w-4" />
                      {employee.phone}
                    </div>
                  )}
                </div>

                <div className="mt-4 pt-4 border-t flex justify-between text-sm">
                  <span className="text-muted-foreground">
                    Joined {format(new Date(employee.joiningDate), 'MMM yyyy')}
                  </span>
                  <span className="font-mono font-medium">
                    {formatCurrency(employee.basicSalary)}/mo
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Employee</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this employee? This action cannot be
              undone.
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
