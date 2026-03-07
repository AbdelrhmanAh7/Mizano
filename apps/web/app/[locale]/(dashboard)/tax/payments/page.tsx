'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { CreditCard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

export default function VATPaymentsPage() {
  const t = useTranslations('tax');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('payments.title')}</h1>
          <p className="text-muted-foreground">{t('payments.description')}</p>
        </div>
      </div>

      <Card>
        <CardContent className="py-12 text-center">
          <CreditCard className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">{t('payments.paymentsTitle')}</h3>
          <p className="text-muted-foreground mb-4">{t('payments.paymentsDescription')}</p>
          <Button asChild>
            <Link href="/tax/returns">{t('payments.viewReturns')}</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
