'use client';

import Link from 'next/link';
import { DollarSign, BarChart3, FileText, ArrowRight } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

const modules = [
  {
    title: 'Bank Accounts',
    description: 'View and manage your bank accounts, balances, and transactions.',
    icon: DollarSign,
    href: '/banking/accounts',
    color: 'text-blue-600',
  },
  {
    title: 'Reconciliation',
    description: 'Match bank statements with your records for accurate bookkeeping.',
    icon: BarChart3,
    href: '/banking/reconcile',
    color: 'text-green-600',
  },
  {
    title: 'Bank Rules',
    description: 'Automate transaction categorization with custom bank rules.',
    icon: FileText,
    href: '/banking/rules',
    color: 'text-purple-600',
  },
];

export default function BankingPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Banking</h1>
        <p className="text-muted-foreground">
          Manage bank accounts, reconcile transactions, and automate categorization.
        </p>
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
