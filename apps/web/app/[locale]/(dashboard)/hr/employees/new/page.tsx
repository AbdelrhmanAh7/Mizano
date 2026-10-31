'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmployeeForm } from '@/components/hr/employee-form';
import { useTranslations } from 'next-intl';

export default function NewEmployeePage() {
  const t = useTranslations('hr');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild aria-label={t('goBack')}>
          <Link href="/hr/employees">
            <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('employees.newEmployee')}</h1>
          <p className="text-muted-foreground">{t('employees.createDescription')}</p>
        </div>
      </div>

      {/* Form */}
      <EmployeeForm />
    </div>
  );
}
