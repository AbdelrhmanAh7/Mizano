'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import {
  Users,
  Clock,
  DollarSign,
  ArrowRight,
  Plus,
  UserPlus,
  ClipboardCheck,
  TrendingUp,
  AlertCircle,
  Building2,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useEmployees,
  usePayrollRuns,
  useDepartmentSummary,
  formatCurrency,
  getPayrollStatusLabel,
  getPayrollStatusColor,
  getMonthName,
} from '@/lib/hooks/use-hr';

export default function HRPage() {
  const t = useTranslations('hr');

  const { data: employeesData, isLoading: empLoading } = useEmployees({ limit: 200 });
  const { data: payrollData, isLoading: payrollLoading } = usePayrollRuns({ limit: 20 });
  const { data: deptSummary, isLoading: deptLoading } = useDepartmentSummary();

  const employees = employeesData?.data || [];
  const payrollRuns = payrollData?.data || payrollData || [];

  const isLoading = empLoading || payrollLoading;

  // Calculate metrics
  const activeCount = employees.filter((e: { status: string }) => e.status === 'ACTIVE').length;
  const inactiveCount = employees.length - activeCount;
  const totalMonthlyPayroll = employees
    .filter((e: { status: string }) => e.status === 'ACTIVE')
    .reduce(
      (sum: number, e: { basicSalary?: string | number }) =>
        sum + parseFloat(String(e.basicSalary || '0')),
      0,
    );
  const pendingPayroll = Array.isArray(payrollRuns)
    ? payrollRuns.filter((r: { status: string }) => r.status === 'DRAFT').length
    : 0;
  const recentRuns = Array.isArray(payrollRuns) ? payrollRuns.slice(0, 5) : [];

  // Department data — API returns { department, count } (already processed from Prisma groupBy)
  const departments: Array<{ department: string; count: number }> = Array.isArray(deptSummary)
    ? deptSummary
    : [];

  const modules = [
    {
      title: t('employees.title'),
      description: t('employees.description'),
      icon: Users,
      href: '/hr/employees',
      color: 'bg-blue-500',
      stats: `${activeCount} active`,
    },
    {
      title: t('attendance.title'),
      description: t('attendance.description'),
      icon: Clock,
      href: '/hr/attendance',
      color: 'bg-green-500',
      stats: t('trackTime'),
    },
    {
      title: t('payroll.title'),
      description: t('payroll.description'),
      icon: DollarSign,
      href: '/hr/payroll',
      color: 'bg-purple-500',
      stats: `${pendingPayroll} pending`,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
        <p className="text-muted-foreground">{t('description')}</p>
      </div>

      {/* Quick Actions */}
      <div className="flex flex-wrap gap-2">
        <Button asChild>
          <Link href="/hr/employees/new">
            <UserPlus className="mr-2 h-4 w-4" />
            {t('hub.addEmployee')}
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/hr/attendance/mark">
            <ClipboardCheck className="mr-2 h-4 w-4" />
            {t('hub.markAttendance')}
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/hr/payroll/run">
            <DollarSign className="mr-2 h-4 w-4" />
            {t('hub.runPayroll')}
          </Link>
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('hub.stats.totalEmployees')}</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <div className="text-2xl font-bold">{employees.length}</div>
            )}
            <p className="text-xs text-muted-foreground">
              {!isLoading
                ? t('hub.stats.totalEmployeesDesc', {
                    active: activeCount,
                    inactive: inactiveCount,
                  })
                : '\u00A0'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('hub.stats.monthlyPayroll')}</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <div className="text-2xl font-bold">{formatCurrency(totalMonthlyPayroll)}</div>
            )}
            <p className="text-xs text-muted-foreground">
              {!isLoading ? t('hub.stats.monthlyPayrollDesc', { count: activeCount }) : '\u00A0'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('hub.stats.attendanceRate')}</CardTitle>
            <Clock className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <div className="text-2xl font-bold text-blue-600">-</div>
            )}
            <p className="text-xs text-muted-foreground">{t('hub.stats.attendanceRateDesc')}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('hub.stats.pendingPayroll')}</CardTitle>
            <AlertCircle className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <div className="text-2xl font-bold text-amber-600">{pendingPayroll}</div>
            )}
            <p className="text-xs text-muted-foreground">
              {!isLoading ? t('hub.stats.pendingPayrollDesc', { count: pendingPayroll }) : '\u00A0'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Module Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {modules.map((module) => (
          <Card key={module.href} className="hover:shadow-md transition-shadow">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${module.color}`}>
                  <module.icon className="h-5 w-5 text-white" />
                </div>
                <div>
                  <CardTitle className="text-lg">{module.title}</CardTitle>
                  {isLoading ? (
                    <Skeleton className="h-4 w-16 mt-1" />
                  ) : (
                    <p className="text-sm text-muted-foreground">{module.stats}</p>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">{module.description}</p>
              <Button asChild variant="outline" className="w-full group">
                <Link href={module.href}>
                  {t('openModule', { title: module.title })}
                  <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Recent Activity & Department Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Recent Payroll */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">{t('hub.recentPayroll')}</CardTitle>
            {recentRuns.length > 0 && (
              <Button asChild variant="outline" size="sm">
                <Link href="/hr/payroll">{t('hub.viewAllPayroll')}</Link>
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {payrollLoading ? (
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : recentRuns.length === 0 ? (
              <div className="text-center py-8">
                <DollarSign className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
                <p className="text-muted-foreground text-sm">{t('hub.noRecentPayroll')}</p>
                <Button asChild size="sm" className="mt-3">
                  <Link href="/hr/payroll/run">
                    <Plus className="mr-2 h-4 w-4" />
                    {t('hub.runPayroll')}
                  </Link>
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {recentRuns.map(
                  (run: {
                    id: string;
                    month: number;
                    year: number;
                    status: string;
                    totalNet: string | number;
                    employeeCount?: number;
                  }) => (
                    <div
                      key={run.id}
                      className="flex items-center justify-between py-2 border-b last:border-0"
                    >
                      <div>
                        <Link
                          href={`/hr/payroll/${run.id}`}
                          className="font-medium hover:underline text-sm"
                        >
                          {getMonthName(run.month)} {run.year}
                        </Link>
                        {run.employeeCount && (
                          <p className="text-xs text-muted-foreground">
                            {t('hub.employeesInDept', { count: run.employeeCount })}
                          </p>
                        )}
                      </div>
                      <div className="text-right">
                        <Badge
                          className={getPayrollStatusColor(
                            run.status as 'DRAFT' | 'CONFIRMED' | 'PAID',
                          )}
                        >
                          {getPayrollStatusLabel(run.status as 'DRAFT' | 'CONFIRMED' | 'PAID')}
                        </Badge>
                        <p className="text-sm font-mono mt-1">{formatCurrency(run.totalNet)}</p>
                      </div>
                    </div>
                  ),
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Department Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t('hub.departmentBreakdown')}</CardTitle>
          </CardHeader>
          <CardContent>
            {deptLoading ? (
              <div className="space-y-3">
                {[...Array(4)].map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : departments.length === 0 ? (
              <div className="text-center py-8">
                <Building2 className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
                <p className="text-muted-foreground text-sm">{t('hub.noDepartments')}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {departments.map((dept: { department: string; count: number }) => {
                  const percentage = employees.length
                    ? Math.round((dept.count / employees.length) * 100)
                    : 0;
                  return (
                    <div key={dept.department} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium">{dept.department || t('unassigned')}</span>
                        <span className="text-muted-foreground">
                          {t('hub.employeesInDept', { count: dept.count })}
                        </span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-500 rounded-full transition-all"
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
