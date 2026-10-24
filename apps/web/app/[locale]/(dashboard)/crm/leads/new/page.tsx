'use client';

import { Link } from '@/i18n/routing';
import { ArrowLeft, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LeadForm } from '@/components/crm/lead-form';
import { useTranslations, useLocale } from 'next-intl';

export default function NewLeadPage() {
  const t = useTranslations('crm');
  const locale = useLocale();
  const isArabic = locale.startsWith('ar');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild aria-label={t('leads.title')}>
            <Link href="/crm/leads">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{t('leads.newLead')}</h1>
            <p className="text-muted-foreground">Capture a new sales lead</p>
          </div>
        </div>
        <Button variant="outline" asChild>
          <Link href="/sales/customers/new">
            <UserPlus className="h-4 w-4 mr-2" />
            {isArabic ? 'إنشاء عميل' : 'Create Customer'}
          </Link>
        </Button>
      </div>
      <LeadForm />
    </div>
  );
}
