'use client';

import Link from 'next/link';
import { format } from 'date-fns';
import { ArrowLeft, Download, Printer, Mail, Building2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table';
import { usePayslip, getPayrollStatusLabel, getPayrollStatusColor } from '@/lib/hooks/use-hr';
import { useOrganization } from '@/lib/hooks/use-organization';
import { useTranslations } from 'next-intl';
import { useDateFnsLocale } from '@/lib/date-locale';
import { useMoneyFormatter } from '@/lib/hooks/use-money-formatter';

export default function PayslipDetailPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const formatCurrency = useMoneyFormatter();
  const t = useTranslations('hr');
  const dateLocale = useDateFnsLocale();
  const { data: payslip, isLoading, isError, refetch } = usePayslip(id);
  const { data: organization } = useOrganization();
  const companyName: string = organization?.name || t('payroll.payslipDoc.companyFallback');
  const companyAddress = [organization?.address, organization?.city, organization?.country]
    .filter((part): part is string => typeof part === 'string' && part.trim() !== '')
    .join(t('payroll.payslipDoc.addressSeparator'));

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-64" />
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

  if (!payslip) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-semibold">{t('payroll.payslipDoc.notFound')}</h2>
        <Button asChild className="mt-4">
          <Link href="/hr/payroll">{t('payroll.title')}</Link>
        </Button>
      </div>
    );
  }

  const employee = payslip.employee || {};
  const allowances = payslip.allowances || {};
  const deductions = payslip.deductions || {};

  const allowancesList = Object.entries(allowances).map(([name, amount]) => ({
    name,
    amount: amount as number,
  }));
  const deductionsList = Object.entries(deductions).map(([name, amount]) => ({
    name,
    amount: amount as number,
  }));

  const totalAllowances = allowancesList.reduce((sum, a) => sum + a.amount, 0);
  const totalDeductions = deductionsList.reduce((sum, d) => sum + d.amount, 0);
  const period = format(new Date(payslip.year, payslip.month - 1), 'MMMM yyyy', {
    locale: dateLocale,
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild aria-label={t('goBack')}>
            <Link href={`/hr/payroll/${payslip.payrollRunId}`}>
              <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight">
                {t('payroll.payslipDoc.title', { period })}
              </h1>
              <Badge variant="outline" className={getPayrollStatusColor(payslip.status)}>
                {getPayrollStatusLabel(payslip.status, t)}
              </Badge>
            </div>
            <p className="text-muted-foreground">{employee.name}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline">
            <Printer className="me-2 h-4 w-4" />
            {t('payroll.payslip.print')}
          </Button>
          <Button variant="outline">
            <Download className="me-2 h-4 w-4" />
            {t('payroll.payslipDoc.downloadPdf')}
          </Button>
          <Button variant="outline">
            <Mail className="me-2 h-4 w-4" />
            {t('payroll.payslipDoc.email')}
          </Button>
        </div>
      </div>

      {/* Payslip Document */}
      <Card className="max-w-4xl mx-auto">
        <CardContent className="p-8">
          {/* Company Header */}
          <div className="flex justify-between items-start mb-8">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                <Building2 className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h2 className="text-xl font-bold">{companyName}</h2>
                {companyAddress && (
                  <p className="text-sm text-muted-foreground">{companyAddress}</p>
                )}
              </div>
            </div>
            <div className="text-end">
              <h3 className="text-lg font-semibold uppercase">{t('payroll.payslip.title')}</h3>
              <p className="text-muted-foreground">{period}</p>
            </div>
          </div>

          <Separator className="my-6" />

          {/* Employee Details */}
          <div className="grid grid-cols-2 gap-8 mb-8">
            <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-2">
                {t('payroll.payslipDoc.employeeDetails')}
              </h4>
              <div className="space-y-1">
                <p className="font-medium">{employee.name}</p>
                <p className="text-sm text-muted-foreground">
                  {t('payroll.payslipDoc.employeeId', { id: employee.employeeNumber ?? '-' })}
                </p>
                <p className="text-sm text-muted-foreground">{employee.jobTitle}</p>
                <p className="text-sm text-muted-foreground">{employee.department}</p>
              </div>
            </div>
            <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-2">
                {t('payroll.payslipDoc.paymentDetails')}
              </h4>
              <div className="space-y-1">
                <p className="text-sm">
                  <span className="text-muted-foreground">{t('payroll.payslipDoc.bank')} </span>
                  {employee.bankName || t('notSpecified')}
                </p>
                <p className="text-sm">
                  <span className="text-muted-foreground">{t('payroll.payslipDoc.account')} </span>
                  <bdi>****{employee.bankAccountNumber?.slice(-4) || '****'}</bdi>
                </p>
                <p className="text-sm">
                  <span className="text-muted-foreground">{t('payroll.payslipDoc.taxId')} </span>
                  {employee.taxId ? <bdi>{employee.taxId}</bdi> : t('notSpecified')}
                </p>
              </div>
            </div>
          </div>

          <Separator className="my-6" />

          {/* Earnings and Deductions */}
          <div className="grid grid-cols-2 gap-8">
            {/* Earnings */}
            <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-4 uppercase">
                {t('payroll.payslip.earnings')}
              </h4>
              <Table>
                <TableBody>
                  <TableRow>
                    <TableCell className="font-medium">
                      {t('payroll.payslip.basicSalary')}
                    </TableCell>
                    <TableCell className="text-end font-mono">
                      {formatCurrency(payslip.basicSalary || 0)}
                    </TableCell>
                  </TableRow>
                  {allowancesList.map((a, i) => (
                    <TableRow key={i}>
                      <TableCell className="capitalize">{a.name}</TableCell>
                      <TableCell className="text-end font-mono">
                        {formatCurrency(a.amount)}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="font-bold">
                    <TableCell>{t('payroll.payslipDoc.totalEarnings')}</TableCell>
                    <TableCell className="text-end font-mono">
                      {formatCurrency((payslip.basicSalary || 0) + totalAllowances)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>

            {/* Deductions */}
            <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-4 uppercase">
                {t('payroll.payslip.deductionsSection')}
              </h4>
              <Table>
                <TableBody>
                  {payslip.lopDays > 0 && (
                    <TableRow>
                      <TableCell>
                        {t('payroll.payslipDoc.lossOfPay', { days: payslip.lopDays })}
                      </TableCell>
                      <TableCell className="text-end font-mono text-destructive">
                        <span dir="ltr">-{formatCurrency(payslip.lopAmount || 0)}</span>
                      </TableCell>
                    </TableRow>
                  )}
                  {deductionsList.map((d, i) => (
                    <TableRow key={i}>
                      <TableCell className="capitalize">{d.name}</TableCell>
                      <TableCell className="text-end font-mono text-destructive">
                        <span dir="ltr">-{formatCurrency(d.amount)}</span>
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow>
                    <TableCell>{t('payroll.payslipDoc.tax')}</TableCell>
                    <TableCell className="text-end font-mono text-destructive">
                      <span dir="ltr">-{formatCurrency(payslip.taxAmount || 0)}</span>
                    </TableCell>
                  </TableRow>
                  <TableRow className="font-bold">
                    <TableCell>{t('payroll.payslipDoc.totalDeductions')}</TableCell>
                    <TableCell className="text-end font-mono text-destructive">
                      <span dir="ltr">
                        -
                        {formatCurrency(
                          totalDeductions + (payslip.taxAmount || 0) + (payslip.lopAmount || 0),
                        )}
                      </span>
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </div>

          <Separator className="my-6" />

          {/* Net Pay */}
          <div className="flex justify-between items-center p-6 bg-primary/5 rounded-lg">
            <div>
              <h4 className="text-sm font-medium text-muted-foreground uppercase">
                {t('payroll.payslip.netPay')}
              </h4>
              <p className="text-sm text-muted-foreground">{t('payroll.payslipDoc.netPayHint')}</p>
            </div>
            <p className="text-4xl font-bold font-mono">{formatCurrency(payslip.netPay || 0)}</p>
          </div>

          {/* Footer */}
          <div className="mt-8 pt-6 border-t text-center text-sm text-muted-foreground">
            <p>{t('payroll.payslipDoc.footer')}</p>
            <p className="mt-1">
              {t('payroll.payslipDoc.generatedOn', {
                date: format(new Date(), 'PPP', { locale: dateLocale }),
              })}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
