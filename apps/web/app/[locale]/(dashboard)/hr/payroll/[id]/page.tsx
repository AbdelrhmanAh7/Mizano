'use client';

import Link from 'next/link';
import { format } from 'date-fns';
import { ArrowLeft, CheckCircle2, Download, FileText, Printer, Mail } from 'lucide-react';
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
import { useTranslations } from 'next-intl';
import { useDateFnsLocale } from '@/lib/date-locale';

export default function PayrollDetailPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const t = useTranslations('hr');
  const tCommon = useTranslations('common');
  const dateLocale = useDateFnsLocale();
  const { data: payrollRun, isLoading, isError, refetch } = usePayrollRun(id);
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

  if (isError) {
    return (
      <div className="text-center py-12 space-y-4" role="alert">
        <p className="text-muted-foreground">{t('loadError')}</p>
        <Button variant="outline" onClick={() => void refetch()}>
          {t('retry')}
        </Button>
      </div>
    );
  }

  if (!payrollRun) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-semibold">{t('payroll.detail.notFound')}</h2>
        <Button asChild className="mt-4">
          <Link href="/hr/payroll">{t('payroll.title')}</Link>
        </Button>
      </div>
    );
  }

  const payslips = payrollRun.payslips || [];
  const totalGross = payslips.reduce(
    (sum: number, p: { gross?: number }) => sum + (p.gross || 0),
    0,
  );
  const totalDeductions = payslips.reduce(
    (sum: number, p: { totalDeductions?: number; taxAmount?: number }) =>
      sum + (p.totalDeductions || 0) + (p.taxAmount || 0),
    0,
  );
  const totalNetPay = payslips.reduce(
    (sum: number, p: { netPay?: number }) => sum + (p.netPay || 0),
    0,
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild aria-label={t('goBack')}>
            <Link href="/hr/payroll">
              <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight">
                {t('payroll.detail.title', {
                  period: format(new Date(payrollRun.year, payrollRun.month - 1), 'MMMM yyyy', {
                    locale: dateLocale,
                  }),
                })}
              </h1>
              <Badge variant="outline" className={getPayrollStatusColor(payrollRun.status)}>
                {getPayrollStatusLabel(payrollRun.status, t)}
              </Badge>
            </div>
            <p className="text-muted-foreground">
              {t('payroll.detail.createdOn', {
                date: format(new Date(payrollRun.createdAt), 'PPP', { locale: dateLocale }),
              })}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {payrollRun.status === 'DRAFT' && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button>
                  <CheckCircle2 className="me-2 h-4 w-4" />
                  {t('payroll.actions.confirmPost')}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t('payroll.confirmDialog.title')}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {t('payroll.confirmDialog.description')}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{tCommon('buttons.cancel')}</AlertDialogCancel>
                  <AlertDialogAction onClick={handleConfirm}>
                    {tCommon('buttons.confirm')}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">
                <Download className="me-2 h-4 w-4" />
                {t('payroll.detail.export')}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem>
                <FileText className="me-2 h-4 w-4" />
                {t('payroll.detail.exportPdf')}
              </DropdownMenuItem>
              <DropdownMenuItem>
                <FileText className="me-2 h-4 w-4" />
                {t('payroll.detail.exportCsv')}
              </DropdownMenuItem>
              <DropdownMenuItem>
                <Printer className="me-2 h-4 w-4" />
                {t('payroll.detail.printAll')}
              </DropdownMenuItem>
              <DropdownMenuItem>
                <Mail className="me-2 h-4 w-4" />
                {t('payroll.detail.emailAll')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">{t('payroll.preview.employees')}</p>
            <p className="text-2xl font-bold">{payslips.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">{t('payroll.summary.totalGross')}</p>
            <p className="text-2xl font-bold font-mono">{formatCurrency(totalGross)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">{t('payroll.summary.totalDeductions')}</p>
            <p className="text-2xl font-bold font-mono text-red-600">
              <span dir="ltr">-{formatCurrency(totalDeductions)}</span>
            </p>
          </CardContent>
        </Card>
        <Card className="bg-primary/5">
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">{t('payroll.summary.totalNet')}</p>
            <p className="text-2xl font-bold font-mono">{formatCurrency(totalNetPay)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Payslips Table */}
      <Card>
        <CardHeader>
          <CardTitle>{t('payroll.payslip.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('payroll.previewTable.employee')}</TableHead>
                <TableHead className="text-end">{t('payroll.previewTable.basic')}</TableHead>
                <TableHead className="text-end">{t('payroll.previewTable.allowances')}</TableHead>
                <TableHead className="text-end">{t('payroll.previewTable.gross')}</TableHead>
                <TableHead className="text-end">{t('payroll.previewTable.lop')}</TableHead>
                <TableHead className="text-end">{t('payroll.previewTable.deductions')}</TableHead>
                <TableHead className="text-end">{t('payroll.previewTable.tax')}</TableHead>
                <TableHead className="text-end">{t('payroll.previewTable.netPay')}</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payslips.map(
                (slip: {
                  id: string;
                  employee?: { name?: string; employeeNumber?: string };
                  basicSalary?: number;
                  allowances?: Record<string, number>;
                  gross?: number;
                  lopDays?: number;
                  totalDeductions?: number;
                  taxAmount?: number;
                  netPay?: number;
                }) => (
                  <TableRow key={slip.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{slip.employee?.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {slip.employee?.employeeNumber}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell className="text-end font-mono">
                      {formatCurrency(slip.basicSalary || 0)}
                    </TableCell>
                    <TableCell className="text-end font-mono text-green-600">
                      <span dir="ltr">
                        +
                        {formatCurrency(
                          Object.values(slip.allowances || {}).reduce(
                            (sum: number, a: number) => sum + (a || 0),
                            0,
                          ),
                        )}
                      </span>
                    </TableCell>
                    <TableCell className="text-end font-mono">
                      {formatCurrency(slip.gross || 0)}
                    </TableCell>
                    <TableCell className="text-end">
                      {(slip.lopDays ?? 0) > 0 ? (
                        <span className="text-red-600">
                          {t('payroll.lopDays', { days: slip.lopDays ?? 0 })}
                        </span>
                      ) : (
                        '-'
                      )}
                    </TableCell>
                    <TableCell className="text-end font-mono text-red-600">
                      <span dir="ltr">-{formatCurrency(slip.totalDeductions || 0)}</span>
                    </TableCell>
                    <TableCell className="text-end font-mono text-red-600">
                      <span dir="ltr">-{formatCurrency(slip.taxAmount || 0)}</span>
                    </TableCell>
                    <TableCell className="text-end font-mono font-medium">
                      {formatCurrency(slip.netPay || 0)}
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" asChild>
                        <Link href={`/hr/payslips/${slip.id}`}>{t('payroll.viewPayslip')}</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ),
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Journal Entry */}
      {payrollRun.status === 'CONFIRMED' && payrollRun.journalId && (
        <Card>
          <CardHeader>
            <CardTitle>{t('payroll.detail.accountingEntry')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
              <div className="flex items-center gap-3">
                <FileText className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="font-medium">{t('payroll.detail.journalCreated')}</p>
                  <p className="text-sm text-muted-foreground">
                    {t('payroll.detail.reference', {
                      reference: `JRN-${payrollRun.journalId.slice(-6).toUpperCase()}`,
                    })}
                  </p>
                </div>
              </div>
              <Button variant="outline" size="sm" asChild>
                <Link href={`/accounting/journals/${payrollRun.journalId}`}>
                  {t('payroll.detail.viewJournal')}
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
