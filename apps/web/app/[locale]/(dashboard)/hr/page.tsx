'use client';

import Link from 'next/link';
import { Users, Clock, DollarSign, ArrowRight } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

const modules = [
  {
    title: 'Employees',
    description: 'Manage employee records, departments, and employment details.',
    icon: Users,
    href: '/hr/employees',
    color: 'text-blue-600',
  },
  {
    title: 'Attendance',
    description: 'Track employee attendance, leave requests, and work hours.',
    icon: Clock,
    href: '/hr/attendance',
    color: 'text-green-600',
  },
  {
    title: 'Payroll',
    description: 'Run payroll, generate payslips, and manage salary disbursements.',
    icon: DollarSign,
    href: '/hr/payroll',
    color: 'text-purple-600',
  },
];

export default function HRPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Human Resources</h1>
        <p className="text-muted-foreground">Manage employees, attendance, and payroll.</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {modules.map((module) => (
          <Card key={module.href} className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg bg-muted ${module.color}`}>
                  <module.icon className="h-6 w-6" />
                </div>
                <CardTitle className="text-xl">{module.title}</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <CardDescription className="text-sm">{module.description}</CardDescription>
              <Link href={module.href}>
                <Button variant="outline" className="w-full group">
                  Open
                  <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
                </Button>
              </Link>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
