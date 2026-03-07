'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LeadForm } from '@/components/crm/lead-form';
import { useTranslations } from 'next-intl';

export default function NewLeadPage() {
  const t = useTranslations('crm');

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/crm/leads">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('leads.newLead')}</h1>
          <p className="text-muted-foreground">Capture a new sales lead</p>
        </div>
      </div>
      <LeadForm />
    </div>
  );
}
