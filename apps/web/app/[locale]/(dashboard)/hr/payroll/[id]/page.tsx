'use client';

import { use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import {
  ArrowLeft,
  CheckCircle2,
  Download,
  FileText,
  Printer,
  Mail,
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  usePayrollRun,
  useConfirmPayroll,
  getPayrollStatusLabel,
  getPayrollStatusColor,
  formatCurrency,
} from '@/lib/hooks/use-hr';

const months = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export default function PayrollDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { data: payrollRun, isLoading } = usePayrollRun(id);
  const confirmPayroll = useConfirmPayroll();

  const handleConfirm = async () => {
    await confirmPayroll.mutateAsync(id);
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-64" />
        <div className="grid grid-cols-4 gap-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (!payrollRun) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-semibold">Payroll run not found</h2>
        <Button asChild className="mt-4">
          <Link href="/hr/payroll">Back to Payroll</Link>
        </Button>
      </div>
    );
  }

  const payslips = payrollRun.payslips || [];
  const totalGross = payslips.reduce((sum: number, p: any) => sum + (p.gross || 0), 0);
  const totalDeductions = payslips.reduce((sum: number, p: any) => sum + (p.totalDeductions || 0) + (p.taxAmount || 0), 0);
  const totalNetPay = payslips.reduce((sum: number, p: any) => sum + (p.netPay || 0), 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/hr/payroll">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight">
                Payroll - {months[payrollRun.month - 1]} {payrollRun.year}
              </h1>
              <Badge
                variant="outline"
                className={getPayrollStatusColor(payrollRun.status)}
              >
                {getPayrollStatusLabel(payrollRun.status)}
              </Badge>
            </div>
            <p className="text-muted-foreground">
              Created on {format(new Date(payrollRun.createdAt), 'MMMM d, yyyy')}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {payrollRun.status === 'DRAFT' && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button>
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  Confirm & Post
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Confirm Payroll</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will finalize the payroll and create accounting entries.
                    This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleConfirm}>
                    Confirm
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">
                <Download className="mr-2 h-4 w-4" />
                Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem>
                <FileText className="mr-2 h-4 w-4" />
                Export as PDF
              </DropdownMenuItem>
              <DropdownMenuItem>
                <FileText className="mr-2 h-4 w-4" />
                Export as CSV
              </DropdownMenuItem>
              <DropdownMenuItem>
                <Printer className="mr-2 h-4 w-4" />
                Print All Payslips
              </DropdownMenuItem>
              <DropdownMenuItem>
                <Mail className="mr-2 h-4 w-4" />
                Email All Payslips
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Employees</p>
            <p className="text-2xl font-bold">{payslips.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Total Gross</p>
            <p className="text-2xl font-bold font-mono">
              {formatCurrency(totalGross)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Total Deductions</p>
            <p className="text-2xl font-bold font-mono text-red-600">
              -{formatCurrency(totalDeductions)}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-primary/5">
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Total Net Pay</p>
            <p className="text-2xl font-bold font-mono">
              {formatCurrency(totalNetPay)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Payslips Table */}
      <Card>
        <CardHeader>
          <CardTitle>Payslips</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead className="text-right">Basic</TableHead>
                <TableHead className="text-right">Allowances</TableHead>
                <TableHead className="text-right">Gross</TableHead>
                <TableHead className="text-right">LOP</TableHead>
                <TableHead className="text-right">Deductions</TableHead>
                <TableHead className="text-right">Tax</TableHead>
                <TableHead className="text-right">Net Pay</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payslips.map((slip: any) => (
                <TableRow key={slip.id}>
                  <TableCell>
                    <div>
                      <p className="font-medium">
                        {slip.employee?.firstName} {slip.employee?.lastName}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {slip.employee?.employeeNumber}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatCurrency(slip.basicSalary || 0)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-green-600">
                    +{formatCurrency(
                      Object.values(slip.allowances || {}).reduce(
                        (sum: number, a: any) => sum + (a || 0),
                        0
                      )
                    )}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatCurrency(slip.gross || 0)}
                  </TableCell>
                  <TableCell className="text-right">
                    {slip.lopDays > 0 ? (
                      <span className="text-red-600">{slip.lopDays} days</span>
                    ) : (
                      '-'
                    )}
                  </TableCell>
                  <TableCell className="text-right font-mono text-red-600">
                    -{formatCurrency(slip.totalDeductions || 0)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-red-600">
                    -{formatCurrency(slip.taxAmount || 0)}
                  </TableCell>
                  <TableCell className="text-right font-mono font-medium">
                    {formatCurrency(slip.netPay || 0)}
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="sm" asChild>
                      <Link href={`/hr/payslips/${slip.id}`}>
                        View
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Journal Entry */}
      {payrollRun.status === 'CONFIRMED' && payrollRun.journalId && (
        <Card>
          <CardHeader>
            <CardTitle>Accounting Entry</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
              <div className="flex items-center gap-3">
                <FileText className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="font-medium">Journal Entry Created</p>
                  <p className="text-sm text-muted-foreground">
                    Reference: JRN-{payrollRun.journalId.slice(-6).toUpperCase()}
                  </p>
                </div>
              </div>
              <Button variant="outline" size="sm" asChild>
                <Link href={`/accounting/journals/${payrollRun.journalId}`}>
                  View Journal
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
