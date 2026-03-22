'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { WorkOrderForm } from '@/components/manufacturing/work-order-form';

export default function NewWorkOrderPage() {
  const t = useTranslations('manufacturing');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/manufacturing/work-orders">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('workOrders.newWorkOrder')}</h1>
          <p className="text-muted-foreground">{t('workOrders.empty.description')}</p>
        </div>
      </div>

      {/* Form */}
      <WorkOrderForm />
    </div>
  );
}
