'use client';

import { useState } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { Plus, Play, Eye, FileText, DollarSign, Users, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
  usePayrollRuns,
  getPayrollStatusLabel,
  getPayrollStatusColor,
  formatCurrency,
} from '@/lib/hooks/use-hr';

export default function PayrollPage() {
  const { data: payrollData, isLoading } = usePayrollRuns();
  const payrollRuns = payrollData?.data || [];

  // Calculate summary
  const totalPaid = payrollRuns
    .filter((p: any) => p.status === 'PAID')
    .reduce((sum: number, p: any) => sum + (p.totalNetPay || 0), 0);
  const pendingRuns = payrollRuns.filter((p: any) => p.status === 'DRAFT').length;
  const confirmedRuns = payrollRuns.filter((p: any) => p.status === 'CONFIRMED').length;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-10 w-32" />
        </div>
        <div className="grid grid-cols-3 gap-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Payroll</h1>
          <p className="text-muted-foreground">
            Manage payroll runs and process employee salaries
          </p>
        </div>
        <Button asChild>
          <Link href="/hr/payroll/run">
            <Play className="mr-2 h-4 w-4" />
            Run Payroll
          </Link>
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <DollarSign className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Paid (YTD)</p>
                <p className="text-2xl font-bold font-mono">
                  {formatCurrency(totalPaid)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <FileText className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Payroll Runs</p>
                <p className="text-2xl font-bold">{payrollRuns.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-yellow-100 rounded-lg">
                <Users className="h-5 w-5 text-yellow-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Pending</p>
                <p className="text-2xl font-bold">{pendingRuns}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 rounded-lg">
                <CheckCircle2 className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Confirmed</p>
                <p className="text-2xl font-bold">{confirmedRuns}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Payroll Runs Table */}
      {payrollRuns.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-12">
              <FileText className="mx-auto h-12 w-12 text-muted-foreground" />
              <h3 className="mt-4 text-lg font-semibold">No payroll runs yet</h3>
              <p className="text-muted-foreground">
                Start by running your first payroll
              </p>
              <Button asChild className="mt-4">
                <Link href="/hr/payroll/run">
                  <Play className="mr-2 h-4 w-4" />
                  Run Payroll
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Payroll History</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Period</TableHead>
                  <TableHead>Employees</TableHead>
                  <TableHead className="text-right">Gross Pay</TableHead>
                  <TableHead className="text-right">Deductions</TableHead>
                  <TableHead className="text-right">Net Pay</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payrollRuns.map((run: any) => (
                  <TableRow key={run.id}>
                    <TableCell className="font-medium">
                      {format(new Date(run.year, run.month - 1), 'MMMM yyyy')}
                    </TableCell>
                    <TableCell>{run.employeeCount || 0}</TableCell>
                    <TableCell className="text-right font-mono">
                      {formatCurrency(run.totalGross || 0)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-red-600">
                      -{formatCurrency(run.totalDeductions || 0)}
                    </TableCell>
                    <TableCell className="text-right font-mono font-medium">
                      {formatCurrency(run.totalNetPay || 0)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={getPayrollStatusColor(run.status)}
                      >
                        {getPayrollStatusLabel(run.status)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {format(new Date(run.createdAt), 'MMM d, yyyy')}
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" asChild>
                        <Link href={`/hr/payroll/${run.id}`}>
                          <Eye className="h-4 w-4" />
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
