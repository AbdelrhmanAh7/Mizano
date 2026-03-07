'use client';

import { use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import {
  ArrowLeft,
  Pencil,
  Trash2,
  Mail,
  Phone,
  Building2,
  Calendar,
  CreditCard,
  FileText,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
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
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  useEmployee,
  useDeleteEmployee,
  useEmployeePayslips,
  getEmployeeStatusLabel,
  getEmployeeStatusColor,
  formatCurrency,
} from '@/lib/hooks/use-hr';
import { useTranslations } from 'next-intl';

export default function EmployeeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const t = useTranslations('hr');
  const router = useRouter();
  const { data: employee, isLoading } = useEmployee(id);
  const { data: payslipsData } = useEmployeePayslips(id);
  const deleteEmployee = useDeleteEmployee();

  const payslips = payslipsData?.data || [];

  const handleDelete = async () => {
    await deleteEmployee.mutateAsync(id);
    router.push('/hr/employees');
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Skeleton className="h-64 md:col-span-1" />
          <Skeleton className="h-64 md:col-span-2" />
        </div>
      </div>
    );
  }

  if (!employee) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-semibold">Employee not found</h2>
        <Button asChild className="mt-4">
          <Link href="/hr/employees">{t('employees.title')}</Link>
        </Button>
      </div>
    );
  }

  const basicSalary =
    typeof employee.basicSalary === 'string'
      ? parseFloat(employee.basicSalary)
      : employee.basicSalary;
  const allowances = employee.allowances || [];
  const deductions = employee.deductions || [];
  const totalAllowances = allowances.reduce(
    (sum: number, a: { amount?: number }) => sum + (a.amount || 0),
    0,
  );
  const totalDeductions = deductions.reduce(
    (sum: number, d: { amount?: number }) => sum + (d.amount || 0),
    0,
  );
  const grossSalary = basicSalary + totalAllowances;
  const netSalary = grossSalary - totalDeductions;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/hr/employees">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16">
              <AvatarFallback className="text-xl bg-primary/10 text-primary">
                {employee.firstName[0]}
                {employee.lastName[0]}
              </AvatarFallback>
            </Avatar>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-3xl font-bold tracking-tight">
                  {employee.firstName} {employee.lastName}
                </h1>
                <Badge variant="outline" className={getEmployeeStatusColor(employee.status)}>
                  {getEmployeeStatusLabel(employee.status)}
                </Badge>
              </div>
              <p className="text-muted-foreground">
                {employee.employeeNumber} • {employee.jobTitle || 'No title'}
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" asChild>
            <Link href={`/hr/employees/${id}/edit`}>
              <Pencil className="mr-2 h-4 w-4" />
              {t('employees.editEmployee')}
            </Link>
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive">
                <Trash2 className="mr-2 h-4 w-4" />
                {t('employees.deleteEmployee')}
              </Button>
            </AlertDialogTrigger>
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
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="salary">Salary Structure</TabsTrigger>
          <TabsTrigger value="payslips">{t('payroll.payslip.title')}</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Contact Info */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Contact Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-3">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">{employee.email}</span>
                </div>
                {employee.phone && (
                  <div className="flex items-center gap-3">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">{employee.phone}</span>
                  </div>
                )}
                {employee.department && (
                  <div className="flex items-center gap-3">
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">{employee.department}</span>
                  </div>
                )}
                <div className="flex items-center gap-3">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">
                    Joined {format(new Date(employee.joiningDate), 'MMMM d, yyyy')}
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* Banking Info */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Banking Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {employee.bankName ? (
                  <>
                    <div className="flex items-center gap-3">
                      <CreditCard className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">{employee.bankName}</span>
                    </div>
                    {employee.bankAccountNumber && (
                      <div className="text-sm text-muted-foreground">
                        Account: ****{employee.bankAccountNumber.slice(-4)}
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">No banking details provided</p>
                )}
                {employee.taxId && (
                  <div className="flex items-center gap-3">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">Tax ID: {employee.taxId}</span>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Salary Summary */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Monthly Salary</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold font-mono">{formatCurrency(netSalary)}</p>
                <p className="text-sm text-muted-foreground mt-1">Net salary after deductions</p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="salary" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Earnings */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Earnings</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableBody>
                    <TableRow>
                      <TableCell>{t('payroll.payslip.basicSalary')}</TableCell>
                      <TableCell className="text-right font-mono">
                        {formatCurrency(basicSalary)}
                      </TableCell>
                    </TableRow>
                    {allowances.map((a: { name: string; amount: number }, i: number) => (
                      <TableRow key={i}>
                        <TableCell>{a.name}</TableCell>
                        <TableCell className="text-right font-mono">
                          {formatCurrency(a.amount)}
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="font-bold">
                      <TableCell>{t('payroll.payslip.grossPay')}</TableCell>
                      <TableCell className="text-right font-mono">
                        {formatCurrency(grossSalary)}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {/* Deductions */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t('payroll.payslip.deductions')}</CardTitle>
              </CardHeader>
              <CardContent>
                {deductions.length > 0 ? (
                  <Table>
                    <TableBody>
                      {deductions.map((d: { name: string; amount: number }, i: number) => (
                        <TableRow key={i}>
                          <TableCell>{d.name}</TableCell>
                          <TableCell className="text-right font-mono text-red-600">
                            -{formatCurrency(d.amount)}
                          </TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="font-bold">
                        <TableCell>Total Deductions</TableCell>
                        <TableCell className="text-right font-mono text-red-600">
                          -{formatCurrency(totalDeductions)}
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                ) : (
                  <p className="text-sm text-muted-foreground">No deductions</p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Net Pay */}
          <Card className="bg-primary/5">
            <CardContent className="pt-6">
              <div className="flex justify-between items-center">
                <span className="text-xl font-bold">{t('payroll.payslip.netPay')}</span>
                <span className="text-3xl font-bold font-mono">{formatCurrency(netSalary)}</span>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="payslips" className="space-y-6">
          {payslips.length > 0 ? (
            <Card>
              <CardContent className="pt-6">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('payroll.payslip.period')}</TableHead>
                      <TableHead className="text-right">{t('payroll.payslip.grossPay')}</TableHead>
                      <TableHead className="text-right">
                        {t('payroll.payslip.deductions')}
                      </TableHead>
                      <TableHead className="text-right">{t('payroll.payslip.netPay')}</TableHead>
                      <TableHead>{t('payroll.table.status')}</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payslips.map(
                      (slip: {
                        id: string;
                        year: number;
                        month: number;
                        gross: number;
                        totalDeductions: number;
                        netPay: number;
                        status: string;
                      }) => (
                        <TableRow key={slip.id}>
                          <TableCell>
                            {format(new Date(slip.year, slip.month - 1), 'MMMM yyyy')}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {formatCurrency(slip.gross)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-red-600">
                            -{formatCurrency(slip.totalDeductions)}
                          </TableCell>
                          <TableCell className="text-right font-mono font-medium">
                            {formatCurrency(slip.netPay)}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{slip.status}</Badge>
                          </TableCell>
                          <TableCell>
                            <Button variant="ghost" size="sm" asChild>
                              <Link href={`/hr/payslips/${slip.id}`}>View</Link>
                            </Button>
                          </TableCell>
                        </TableRow>
                      ),
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="pt-6">
                <div className="text-center py-8">
                  <FileText className="mx-auto h-12 w-12 text-muted-foreground" />
                  <h3 className="mt-4 text-lg font-semibold">No payslips yet</h3>
                  <p className="text-muted-foreground">
                    Payslips will appear here after running payroll
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
