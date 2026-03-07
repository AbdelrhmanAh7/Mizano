'use client';

import Link from 'next/link';
import { BookOpen, FileText, Clock, ArrowRight } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useTranslations } from 'next-intl';

export default function AccountingPage() {
  const t = useTranslations('accounting');

  const accountingModules = [
    {
      title: t('accounts.title'),
      description:
        'Manage your accounts hierarchy, create new accounts, and view account balances.',
      icon: BookOpen,
      href: '/accounting/accounts',
      color: 'text-blue-600',
    },
    {
      title: t('journals.title'),
      description:
        'Create manual journal entries, record adjustments, and maintain accurate books.',
      icon: FileText,
      href: '/accounting/journals',
      color: 'text-green-600',
    },
    {
      title: t('recurring.title'),
      description: 'Automate repetitive journal entries with scheduled recurring transactions.',
      icon: Clock,
      href: '/accounting/recurring',
      color: 'text-purple-600',
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
        <p className="text-muted-foreground">{t('description')}</p>
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
