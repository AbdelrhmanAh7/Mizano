'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmployeeForm } from '@/components/hr/employee-form';

export default function NewEmployeePage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/hr/employees">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Add Employee</h1>
          <p className="text-muted-foreground">
            Create a new employee profile
          </p>
        </div>
      </div>

      {/* Form */}
      <EmployeeForm />
    </div>
  );
}
