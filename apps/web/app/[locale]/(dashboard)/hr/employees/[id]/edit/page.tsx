'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmployeeForm } from '@/components/hr/employee-form';
import { useEmployee } from '@/lib/hooks/use-hr';
import { useTranslations } from 'next-intl';

export default function EditEmployeePage({ params }: { params: { id: string } }) {
  const { id } = params;
  const t = useTranslations('hr');
  const { data: employee, isLoading, isError, refetch } = useEmployee(id);

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

  if (!employee) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-semibold">{t('employees.notFound')}</h2>
        <Button asChild className="mt-4">
          <Link href="/hr/employees">{t('employees.backToEmployees')}</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild aria-label={t('goBack')}>
          <Link href={`/hr/employees/${id}`}>
            <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('employees.editEmployee')}</h1>
          <p className="text-muted-foreground">
            {t('employees.editDescription', { name: employee.name })}
          </p>
        </div>
      </div>

      {/* Form */}
      <EmployeeForm employee={employee} />
    </div>
  );
}
