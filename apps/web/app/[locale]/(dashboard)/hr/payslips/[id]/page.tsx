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
import {
  usePayslip,
  getPayrollStatusLabel,
  getPayrollStatusColor,
  formatCurrency,
} from '@/lib/hooks/use-hr';
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

export default function PayslipDetailPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const t = useTranslations('hr');
  const { data: payslip, isLoading } = usePayslip(id);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (!payslip) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-semibold">{t('payroll.payslip.title')} not found</h2>
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href={`/hr/payroll/${payslip.payrollRunId}`}>
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight">
                {t('payroll.payslip.title')} - {months[payslip.month - 1]} {payslip.year}
              </h1>
              <Badge variant="outline" className={getPayrollStatusColor(payslip.status)}>
                {getPayrollStatusLabel(payslip.status)}
              </Badge>
            </div>
            <p className="text-muted-foreground">
              {employee.firstName} {employee.lastName}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline">
            <Printer className="mr-2 h-4 w-4" />
            Print
          </Button>
          <Button variant="outline">
            <Download className="mr-2 h-4 w-4" />
            Download PDF
          </Button>
          <Button variant="outline">
            <Mail className="mr-2 h-4 w-4" />
            Email
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
                <h2 className="text-xl font-bold">Your Company Name</h2>
                <p className="text-sm text-muted-foreground">123 Business Street, City, Country</p>
              </div>
            </div>
            <div className="text-right">
              <h3 className="text-lg font-semibold">{t('payroll.payslip.title').toUpperCase()}</h3>
              <p className="text-muted-foreground">
                {months[payslip.month - 1]} {payslip.year}
              </p>
            </div>
          </div>

          <Separator className="my-6" />

          {/* Employee Details */}
          <div className="grid grid-cols-2 gap-8 mb-8">
            <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-2">Employee Details</h4>
              <div className="space-y-1">
                <p className="font-medium">
                  {employee.firstName} {employee.lastName}
                </p>
                <p className="text-sm text-muted-foreground">ID: {employee.employeeNumber}</p>
                <p className="text-sm text-muted-foreground">{employee.jobTitle}</p>
                <p className="text-sm text-muted-foreground">{employee.department}</p>
              </div>
            </div>
            <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-2">Payment Details</h4>
              <div className="space-y-1">
                <p className="text-sm">
                  <span className="text-muted-foreground">Bank: </span>
                  {employee.bankName || 'Not specified'}
                </p>
                <p className="text-sm">
                  <span className="text-muted-foreground">Account: </span>
                  ****{employee.bankAccountNumber?.slice(-4) || '****'}
                </p>
                <p className="text-sm">
                  <span className="text-muted-foreground">Tax ID: </span>
                  {employee.taxId || 'Not specified'}
                </p>
              </div>
            </div>
          </div>

          <Separator className="my-6" />

          {/* Earnings and Deductions */}
          <div className="grid grid-cols-2 gap-8">
            {/* Earnings */}
            <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-4">EARNINGS</h4>
              <Table>
                <TableBody>
                  <TableRow>
                    <TableCell className="font-medium">
                      {t('payroll.payslip.basicSalary')}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {formatCurrency(payslip.basicSalary || 0)}
                    </TableCell>
                  </TableRow>
                  {allowancesList.map((a, i) => (
                    <TableRow key={i}>
                      <TableCell className="capitalize">{a.name}</TableCell>
                      <TableCell className="text-right font-mono">
                        {formatCurrency(a.amount)}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="font-bold">
                    <TableCell>Total Earnings</TableCell>
                    <TableCell className="text-right font-mono">
                      {formatCurrency((payslip.basicSalary || 0) + totalAllowances)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>

            {/* Deductions */}
            <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-4">DEDUCTIONS</h4>
              <Table>
                <TableBody>
                  {payslip.lopDays > 0 && (
                    <TableRow>
                      <TableCell>Loss of Pay ({payslip.lopDays} days)</TableCell>
                      <TableCell className="text-right font-mono text-red-600">
                        -{formatCurrency(payslip.lopAmount || 0)}
                      </TableCell>
                    </TableRow>
                  )}
                  {deductionsList.map((d, i) => (
                    <TableRow key={i}>
                      <TableCell className="capitalize">{d.name}</TableCell>
                      <TableCell className="text-right font-mono text-red-600">
                        -{formatCurrency(d.amount)}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow>
                    <TableCell>Tax</TableCell>
                    <TableCell className="text-right font-mono text-red-600">
                      -{formatCurrency(payslip.taxAmount || 0)}
                    </TableCell>
                  </TableRow>
                  <TableRow className="font-bold">
                    <TableCell>Total Deductions</TableCell>
                    <TableCell className="text-right font-mono text-red-600">
                      -
                      {formatCurrency(
                        totalDeductions + (payslip.taxAmount || 0) + (payslip.lopAmount || 0),
                      )}
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
              <h4 className="text-sm font-medium text-muted-foreground">
                {t('payroll.payslip.netPay').toUpperCase()}
              </h4>
              <p className="text-sm text-muted-foreground">Amount payable after all deductions</p>
            </div>
            <p className="text-4xl font-bold font-mono">{formatCurrency(payslip.netPay || 0)}</p>
          </div>

          {/* Footer */}
          <div className="mt-8 pt-6 border-t text-center text-sm text-muted-foreground">
            <p>This is a computer-generated payslip. No signature required.</p>
            <p className="mt-1">Generated on {format(new Date(), 'MMMM d, yyyy')}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
