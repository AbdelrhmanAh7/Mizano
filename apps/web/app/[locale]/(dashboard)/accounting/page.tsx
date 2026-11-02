'use client';

import Link from 'next/link';
import { BookOpen, FileText, RefreshCw, Scale, BookMarked, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const MODULES = [
  {
    key: 'accounts',
    icon: BookOpen,
    href: '/accounting/accounts',
    color: 'bg-info text-info-foreground',
  },
  {
    key: 'journals',
    icon: FileText,
    href: '/accounting/journals',
    color: 'bg-success text-success-foreground',
  },
  {
    key: 'recurring',
    icon: RefreshCw,
    href: '/accounting/recurring',
    color: 'bg-primary text-primary-foreground',
  },
  {
    key: 'trialBalance',
    icon: Scale,
    href: '/accounting/trial-balance',
    color: 'bg-warning text-warning-foreground',
  },
  {
    key: 'generalLedger',
    icon: BookMarked,
    href: '/accounting/general-ledger',
    color: 'bg-info text-info-foreground',
  },
] as const;

const MODULE_TITLE_KEYS = {
  accounts: 'accounts.title',
  journals: 'journals.title',
  recurring: 'recurring.title',
  trialBalance: 'trialBalance.title',
  generalLedger: 'generalLedger.title',
} as const;

export default function AccountingPage() {
  const t = useTranslations('accounting');
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
        <p className="text-muted-foreground">{t('hub.description')}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button asChild>
          <Link href="/accounting/journals/new">
            <Plus className="mr-2 h-4 w-4" />
            {t('journals.newJournal')}
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/accounting/accounts">
            <BookOpen className="mr-2 h-4 w-4" />
            {t('accounts.title')}
          </Link>
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {MODULES.map((module) => (
          <Card key={module.href} className="hover:shadow-md transition-shadow">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${module.color}`}>
                  <module.icon className="h-5 w-5" />
                </div>
                <CardTitle className="text-lg">{t(MODULE_TITLE_KEYS[module.key])}</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">{t(`hub.modules.${module.key}`)}</p>
              <Button asChild variant="outline" className="w-full">
                <Link href={module.href}>
                  {t('hub.open', { title: t(MODULE_TITLE_KEYS[module.key]) })}
                </Link>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
