'use client';

import Link from 'next/link';
import { BookOpen, FileText, Clock, ArrowRight } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

const accountingModules = [
  {
    title: 'Chart of Accounts',
    description: 'Manage your accounts hierarchy, create new accounts, and view account balances.',
    icon: BookOpen,
    href: '/accounting/accounts',
    color: 'text-blue-600',
  },
  {
    title: 'Journal Entries',
    description: 'Create manual journal entries, record adjustments, and maintain accurate books.',
    icon: FileText,
    href: '/accounting/journals',
    color: 'text-green-600',
  },
  {
    title: 'Recurring Journals',
    description: 'Automate repetitive journal entries with scheduled recurring transactions.',
    icon: Clock,
    href: '/accounting/recurring',
    color: 'text-purple-600',
  },
];

export default function AccountingPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Accounting</h1>
        <p className="text-muted-foreground">
          Manage your chart of accounts, journal entries, and recurring transactions.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {accountingModules.map((module) => (
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
