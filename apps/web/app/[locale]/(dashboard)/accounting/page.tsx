'use client';

import Link from 'next/link';
import { BookOpen, FileText, RefreshCw, Scale, BookMarked, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const modules = [
  {
    title: 'Chart of Accounts',
    description: 'Manage your accounts hierarchy, types, and balances',
    icon: BookOpen,
    href: '/accounting/accounts',
    color: 'bg-blue-500',
  },
  {
    title: 'Journal Entries',
    description: 'Create and manage double-entry journal entries',
    icon: FileText,
    href: '/accounting/journals',
    color: 'bg-green-500',
  },
  {
    title: 'Recurring Profiles',
    description: 'Automate recurring journal entries on a schedule',
    icon: RefreshCw,
    href: '/accounting/recurring',
    color: 'bg-purple-500',
  },
  {
    title: 'Trial Balance',
    description: 'View debit and credit balances for all accounts',
    icon: Scale,
    href: '/accounting/trial-balance',
    color: 'bg-orange-500',
  },
  {
    title: 'General Ledger',
    description: 'View detailed transaction history by account',
    icon: BookMarked,
    href: '/accounting/general-ledger',
    color: 'bg-cyan-500',
  },
];

export default function AccountingPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Accounting</h1>
        <p className="text-muted-foreground">
          Manage your chart of accounts, journal entries, and financial reports
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button asChild>
          <Link href="/accounting/journals/new">
            <Plus className="mr-2 h-4 w-4" />
            New Journal Entry
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/accounting/accounts">
            <BookOpen className="mr-2 h-4 w-4" />
            Chart of Accounts
          </Link>
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {modules.map((module) => (
          <Card key={module.href} className="hover:shadow-md transition-shadow">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${module.color}`}>
                  <module.icon className="h-5 w-5 text-white" />
                </div>
                <CardTitle className="text-lg">{module.title}</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">{module.description}</p>
              <Button asChild variant="outline" className="w-full">
                <Link href={module.href}>Open {module.title}</Link>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
