'use client';

import Link from 'next/link';
import { Users, Receipt, FileText, Banknote, CreditCard, ArrowRight } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

const modules = [
  {
    title: 'Vendors',
    description: 'Manage your vendor contacts, payment terms, and purchase history.',
    icon: Users,
    href: '/purchases/vendors',
    color: 'text-blue-600',
  },
  {
    title: 'Expenses',
    description: 'Record and categorize business expenses for accurate tracking.',
    icon: Receipt,
    href: '/purchases/expenses',
    color: 'text-red-600',
  },
  {
    title: 'Bills',
    description: 'Track vendor bills, schedule payments, and manage accounts payable.',
    icon: FileText,
    href: '/purchases/bills',
    color: 'text-purple-600',
  },
  {
    title: 'Payments Made',
    description: 'Record payments made to vendors and suppliers.',
    icon: Banknote,
    href: '/purchases/payments',
    color: 'text-emerald-600',
  },
  {
    title: 'Vendor Credits',
    description: 'Manage vendor credits and apply them to outstanding bills.',
    icon: CreditCard,
    href: '/purchases/credits',
    color: 'text-orange-600',
  },
];

export default function PurchasesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Purchases</h1>
        <p className="text-muted-foreground">Manage vendors, expenses, bills, and payments made.</p>
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
