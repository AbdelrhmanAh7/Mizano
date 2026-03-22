'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getMonth, getYear } from 'date-fns';
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
import { useEmployees, useRunPayroll, useConfirmPayroll, formatCurrency } from '@/lib/hooks/use-hr';
import { useTranslations } from 'next-intl';

const months = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
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
  const t = useTranslations('hr');
  const tCommon = useTranslations('common');
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
    const previewData: PayslipPreview[] = employees.map(
      (emp: {
        id: string;
        name: string;
        basicSalary: string | number;
        allowances?: { amount?: number }[];
        deductions?: { amount?: number }[];
      }) => {
        const basicSalary =
          typeof emp.basicSalary === 'string' ? parseFloat(emp.basicSalary) : emp.basicSalary;
        const allowances = Array.isArray(emp.allowances) ? emp.allowances : [];
        const deductions = Array.isArray(emp.deductions) ? emp.deductions : [];
        const totalAllowances = allowances.reduce(
          (sum: number, a: { amount?: number }) => sum + (a.amount || 0),
          0,
        );
        const totalDeductions = deductions.reduce(
          (sum: number, d: { amount?: number }) => sum + (d.amount || 0),
          0,
        );
        const gross = basicSalary + totalAllowances;
        const lopDays = 0; // Would be calculated from attendance
        const lopAmount = 0;
        const taxAmount = gross * 0.1; // Simplified tax calculation
        const netPay = gross - lopAmount - totalDeductions - taxAmount;

        return {
          employeeId: emp.id,
          employeeName: emp.name,
          basicSalary,
          totalAllowances,
          gross,
          lopDays,
          lopAmount,
          totalDeductions,
          taxAmount,
          netPay,
        };
      },
    );

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
          <h1 className="text-3xl font-bold tracking-tight">{t('payroll.newRun')}</h1>
          <p className="text-muted-foreground">{t('payroll.process')}</p>
        </div>
      </div>

      {/* Progress Steps */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <div
            className={`w-8 h-8 rounded-full flex items-center justify-center ${
              step === 'select' ? 'bg-primary text-primary-foreground' : 'bg-green-500 text-white'
            }`}
          >
            {step === 'select' ? '1' : <CheckCircle2 className="h-5 w-5" />}
          </div>
          <span className="font-medium">{t('payroll.steps.selectPeriod')}</span>
        </div>
        <div className="flex-1 h-1 bg-muted">
          <div
            className={`h-full bg-primary transition-all ${
              step === 'select' ? 'w-0' : step === 'preview' ? 'w-1/2' : 'w-full'
            }`}
          />
        </div>
        <div className="flex items-center gap-2">
          <div
            className={`w-8 h-8 rounded-full flex items-center justify-center ${
              step === 'select'
                ? 'bg-muted text-muted-foreground'
                : step === 'preview'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-green-500 text-white'
            }`}
          >
            {step === 'confirm' ? <CheckCircle2 className="h-5 w-5" /> : '2'}
          </div>
          <span className="font-medium">{t('payroll.steps.preview')}</span>
        </div>
        <div className="flex-1 h-1 bg-muted">
          <div
            className={`h-full bg-primary transition-all ${step === 'confirm' ? 'w-full' : 'w-0'}`}
          />
        </div>
        <div className="flex items-center gap-2">
          <div
            className={`w-8 h-8 rounded-full flex items-center justify-center ${
              step === 'confirm'
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground'
            }`}
          >
            3
          </div>
          <span className="font-medium">{t('payroll.steps.confirm')}</span>
        </div>
      </div>

      {/* Step 1: Select Period */}
      {step === 'select' && (
        <Card>
          <CardHeader>
            <CardTitle>{t('payroll.selectPeriod.title')}</CardTitle>
            <CardDescription>{t('payroll.selectPeriod.description')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-2 gap-4 max-w-md">
              <div className="space-y-2">
                <Label>{t('payroll.form.month')}</Label>
                <Select value={month.toString()} onValueChange={(v) => setMonth(parseInt(v))}>
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
                <Label>{t('payroll.form.year')}</Label>
                <Select value={year.toString()} onValueChange={(v) => setYear(parseInt(v))}>
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
                    {t('payroll.selectPeriod.processingFor', { month: months[month - 1], year })}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {t('payroll.selectPeriod.employeesIncluded', { count: employees.length })}
                  </p>
                </div>
              </div>
            </div>

            <Button onClick={handleGeneratePreview} disabled={employees.length === 0}>
              {t('payroll.selectPeriod.generatePreview')}
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
                <p className="text-sm text-muted-foreground">{t('payroll.preview.employees')}</p>
                <p className="text-2xl font-bold">{preview.length}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">{t('payroll.preview.totalGross')}</p>
                <p className="text-2xl font-bold font-mono">{formatCurrency(totalGross)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">
                  {t('payroll.preview.totalDeductions')}
                </p>
                <p className="text-2xl font-bold font-mono text-red-600">
                  -{formatCurrency(totalDeductions)}
                </p>
              </CardContent>
            </Card>
            <Card className="bg-primary/5">
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">{t('payroll.preview.totalNetPay')}</p>
                <p className="text-2xl font-bold font-mono">{formatCurrency(totalNetPay)}</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>
                {t('payroll.preview.title', { month: months[month - 1], year })}
              </CardTitle>
              <CardDescription>{t('payroll.preview.description')}</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('payroll.previewTable.employee')}</TableHead>
                    <TableHead className="text-right">{t('payroll.previewTable.basic')}</TableHead>
                    <TableHead className="text-right">
                      {t('payroll.previewTable.allowances')}
                    </TableHead>
                    <TableHead className="text-right">{t('payroll.previewTable.gross')}</TableHead>
                    <TableHead className="text-right">{t('payroll.previewTable.lop')}</TableHead>
                    <TableHead className="text-right">
                      {t('payroll.previewTable.deductions')}
                    </TableHead>
                    <TableHead className="text-right">{t('payroll.previewTable.tax')}</TableHead>
                    <TableHead className="text-right">{t('payroll.previewTable.netPay')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.map((slip) => (
                    <TableRow key={slip.employeeId}>
                      <TableCell className="font-medium">{slip.employeeName}</TableCell>
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
                            {t('payroll.lopDays', { days: slip.lopDays })}
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
              {t('payroll.actions.back')}
            </Button>
            <Button onClick={handleRunPayroll} disabled={runPayroll.isPending}>
              <Play className="mr-2 h-4 w-4" />
              {runPayroll.isPending
                ? t('payroll.actions.processing')
                : t('payroll.actions.runPayroll')}
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
              <h2 className="text-2xl font-bold">{t('payroll.success.title')}</h2>
              <p className="text-muted-foreground">
                {t('payroll.success.description', {
                  month: months[month - 1],
                  year,
                  count: preview.length,
                })}
              </p>
              <div className="py-4">
                <Badge variant="outline" className="text-lg px-4 py-2">
                  {t('payroll.success.totalNetPay', { amount: formatCurrency(totalNetPay) })}
                </Badge>
              </div>
              <div className="flex justify-center gap-4">
                <Button variant="outline" asChild>
                  <Link href={`/hr/payroll/${payrollRunId}`}>
                    {t('payroll.actions.viewDetails')}
                  </Link>
                </Button>
                <Button onClick={() => setShowConfirmDialog(true)}>
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  {t('payroll.actions.confirmPost')}
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
            <AlertDialogTitle>{t('payroll.confirmDialog.title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('payroll.confirmDialog.description')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tCommon('buttons.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmPayroll} disabled={confirmPayroll.isPending}>
              {confirmPayroll.isPending
                ? t('payroll.actions.confirming')
                : t('payroll.actions.confirmPayroll')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
