'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { format, getMonth, getYear } from 'date-fns';
import { ArrowLeft, Play, CheckCircle2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Progress } from '@/components/ui/progress';
import {
  useEmployees,
  useRunPayroll,
  useConfirmPayroll,
  formatCurrency,
} from '@/lib/hooks/use-hr';

const months = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

interface PayslipPreview {
  employeeId: string;
  employeeName: string;
  basicSalary: number;
  totalAllowances: number;
  gross: number;
  lopDays: number;
  lopAmount: number;
  totalDeductions: number;
  taxAmount: number;
  netPay: number;
}

export default function RunPayrollPage() {
  const router = useRouter();
  const today = new Date();
  const [month, setMonth] = useState(getMonth(today) + 1);
  const [year, setYear] = useState(getYear(today));
  const [step, setStep] = useState<'select' | 'preview' | 'confirm'>('select');
  const [preview, setPreview] = useState<PayslipPreview[]>([]);
  const [payrollRunId, setPayrollRunId] = useState<string | null>(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  const { data: employeesData, isLoading: employeesLoading } = useEmployees({ status: 'ACTIVE' });
  const runPayroll = useRunPayroll();
  const confirmPayroll = useConfirmPayroll();

  const employees = employeesData?.data || [];

  const handleGeneratePreview = async () => {
    // In real implementation, this would call an API to generate preview
    // For now, simulate with local calculation
    const previewData: PayslipPreview[] = employees.map((emp: any) => {
      const basicSalary = typeof emp.basicSalary === 'string'
        ? parseFloat(emp.basicSalary)
        : emp.basicSalary;
      const allowances = emp.allowances || [];
      const deductions = emp.deductions || [];
      const totalAllowances = allowances.reduce((sum: number, a: any) => sum + (a.amount || 0), 0);
      const totalDeductions = deductions.reduce((sum: number, d: any) => sum + (d.amount || 0), 0);
      const gross = basicSalary + totalAllowances;
      const lopDays = 0; // Would be calculated from attendance
      const lopAmount = 0;
      const taxAmount = gross * 0.1; // Simplified tax calculation
      const netPay = gross - lopAmount - totalDeductions - taxAmount;

      return {
        employeeId: emp.id,
        employeeName: `${emp.firstName} ${emp.lastName}`,
        basicSalary,
        totalAllowances,
        gross,
        lopDays,
        lopAmount,
        totalDeductions,
        taxAmount,
        netPay,
      };
    });

    setPreview(previewData);
    setStep('preview');
  };

  const handleRunPayroll = async () => {
    try {
      const result = await runPayroll.mutateAsync({ month, year });
      setPayrollRunId(result.id);
      setStep('confirm');
    } catch (error) {
      // Error handled by mutation
    }
  };

  const handleConfirmPayroll = async () => {
    if (!payrollRunId) return;
    try {
      await confirmPayroll.mutateAsync(payrollRunId);
      router.push(`/hr/payroll/${payrollRunId}`);
    } catch (error) {
      // Error handled by mutation
    }
  };

  // Calculate totals
  const totalGross = preview.reduce((sum, p) => sum + p.gross, 0);
  const totalDeductions = preview.reduce((sum, p) => sum + p.totalDeductions + p.taxAmount, 0);
  const totalNetPay = preview.reduce((sum, p) => sum + p.netPay, 0);

  const years = Array.from({ length: 5 }, (_, i) => getYear(today) - 2 + i);

  if (employeesLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/hr/payroll">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Run Payroll</h1>
          <p className="text-muted-foreground">
            Process employee salaries for a pay period
          </p>
        </div>
      </div>

      {/* Progress Steps */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
            step === 'select' ? 'bg-primary text-primary-foreground' : 'bg-green-500 text-white'
          }`}>
            {step === 'select' ? '1' : <CheckCircle2 className="h-5 w-5" />}
          </div>
          <span className="font-medium">Select Period</span>
        </div>
        <div className="flex-1 h-1 bg-muted">
          <div className={`h-full bg-primary transition-all ${
            step === 'select' ? 'w-0' : step === 'preview' ? 'w-1/2' : 'w-full'
          }`} />
        </div>
        <div className="flex items-center gap-2">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
            step === 'select' ? 'bg-muted text-muted-foreground' :
            step === 'preview' ? 'bg-primary text-primary-foreground' : 'bg-green-500 text-white'
          }`}>
            {step === 'confirm' ? <CheckCircle2 className="h-5 w-5" /> : '2'}
          </div>
          <span className="font-medium">Preview</span>
        </div>
        <div className="flex-1 h-1 bg-muted">
          <div className={`h-full bg-primary transition-all ${
            step === 'confirm' ? 'w-full' : 'w-0'
          }`} />
        </div>
        <div className="flex items-center gap-2">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
            step === 'confirm' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
          }`}>
            3
          </div>
          <span className="font-medium">Confirm</span>
        </div>
      </div>

      {/* Step 1: Select Period */}
      {step === 'select' && (
        <Card>
          <CardHeader>
            <CardTitle>Select Pay Period</CardTitle>
            <CardDescription>
              Choose the month and year for this payroll run
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-2 gap-4 max-w-md">
              <div className="space-y-2">
                <Label>Month</Label>
                <Select
                  value={month.toString()}
                  onValueChange={(v) => setMonth(parseInt(v))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {months.map((m, i) => (
                      <SelectItem key={i} value={(i + 1).toString()}>
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Year</Label>
                <Select
                  value={year.toString()}
                  onValueChange={(v) => setYear(parseInt(v))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {years.map((y) => (
                      <SelectItem key={y} value={y.toString()}>
                        {y}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="rounded-lg bg-muted p-4">
              <div className="flex items-center gap-3">
                <AlertCircle className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="font-medium">
                    Processing payroll for {months[month - 1]} {year}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {employees.length} active employees will be included
                  </p>
                </div>
              </div>
            </div>

            <Button onClick={handleGeneratePreview} disabled={employees.length === 0}>
              Generate Preview
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Preview */}
      {step === 'preview' && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">Employees</p>
                <p className="text-2xl font-bold">{preview.length}</p>
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

          <Card>
            <CardHeader>
              <CardTitle>
                Payroll Preview - {months[month - 1]} {year}
              </CardTitle>
              <CardDescription>
                Review the calculated salaries before processing
              </CardDescription>
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
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.map((slip) => (
                    <TableRow key={slip.employeeId}>
                      <TableCell className="font-medium">
                        {slip.employeeName}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatCurrency(slip.basicSalary)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-green-600">
                        +{formatCurrency(slip.totalAllowances)}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatCurrency(slip.gross)}
                      </TableCell>
                      <TableCell className="text-right">
                        {slip.lopDays > 0 ? (
                          <span className="text-red-600">
                            {slip.lopDays} days
                          </span>
                        ) : (
                          '-'
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono text-red-600">
                        -{formatCurrency(slip.totalDeductions)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-red-600">
                        -{formatCurrency(slip.taxAmount)}
                      </TableCell>
                      <TableCell className="text-right font-mono font-medium">
                        {formatCurrency(slip.netPay)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep('select')}>
              Back
            </Button>
            <Button onClick={handleRunPayroll} disabled={runPayroll.isPending}>
              <Play className="mr-2 h-4 w-4" />
              {runPayroll.isPending ? 'Processing...' : 'Run Payroll'}
            </Button>
          </div>
        </>
      )}

      {/* Step 3: Confirm */}
      {step === 'confirm' && (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center space-y-4">
              <CheckCircle2 className="mx-auto h-16 w-16 text-green-500" />
              <h2 className="text-2xl font-bold">Payroll Generated Successfully</h2>
              <p className="text-muted-foreground">
                Payslips for {months[month - 1]} {year} have been created for {preview.length} employees.
              </p>
              <div className="py-4">
                <Badge variant="outline" className="text-lg px-4 py-2">
                  Total Net Pay: {formatCurrency(totalNetPay)}
                </Badge>
              </div>
              <div className="flex justify-center gap-4">
                <Button variant="outline" asChild>
                  <Link href={`/hr/payroll/${payrollRunId}`}>
                    View Details
                  </Link>
                </Button>
                <Button onClick={() => setShowConfirmDialog(true)}>
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  Confirm & Post
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Confirm Dialog */}
      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Payroll</AlertDialogTitle>
            <AlertDialogDescription>
              This will finalize the payroll and create accounting entries.
              This action cannot be undone. Make sure all details are correct.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmPayroll}
              disabled={confirmPayroll.isPending}
            >
              {confirmPayroll.isPending ? 'Confirming...' : 'Confirm Payroll'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
