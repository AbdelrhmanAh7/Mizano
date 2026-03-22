'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useAllOrganizationSettings,
  useUpdateFinancialSettings,
  useUpdateLockDate,
} from '@/lib/hooks/use-all-settings';
import { zodResolver } from '@hookform/resolvers/zod';
import { format } from 'date-fns';
import { ArrowLeft, Calendar, Lock, Save } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const schema = z.object({
  fiscalYearStartMonth: z.coerce.number().min(1).max(12),
  defaultPaymentTermsDays: z.coerce.number().min(0).max(365),
});

type FormData = z.infer<typeof schema>;

export default function FinancialSettingsPage() {
  const t = useTranslations('settings');
  const { data: settings, isLoading } = useAllOrganizationSettings();
  const updateFinancial = useUpdateFinancialSettings();
  const updateLockDate = useUpdateLockDate();

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      fiscalYearStartMonth: 1,
      defaultPaymentTermsDays: 30,
    },
  });

  useEffect(() => {
    if (settings?.financial) {
      form.reset({
        fiscalYearStartMonth: settings.financial.fiscalYearStartMonth || 1,
        defaultPaymentTermsDays: settings.financial.defaultPaymentTermsDays || 30,
      });
    }
  }, [settings, form]);

  const onSubmit = (data: FormData) => {
    updateFinancial.mutate(data);
  };

  const handleClearLockDate = () => {
    updateLockDate.mutate(null);
  };

  const handleSetLockDate = () => {
    // Set lock date to end of previous month
    const now = new Date();
    const lastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
    updateLockDate.mutate(lastMonth.toISOString());
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="rounded-xl border bg-card p-6 space-y-4">
          <Skeleton className="h-6 w-40" />
          <div className="grid grid-cols-2 gap-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild aria-label={t('common.goBack')}>
          <Link href="/settings">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('financial.title')}</h1>
          <p className="text-muted-foreground text-sm">{t('financial.description')}</p>
        </div>
      </div>

      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {/* Fiscal Year & Payment Terms */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              {t('financial.fiscalYearDefaults')}
            </CardTitle>
            <CardDescription>{t('financial.fiscalYearDefaultsDescription')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('financial.fiscalYearStartMonth')}</Label>
                <Select
                  value={String(form.watch('fiscalYearStartMonth'))}
                  onValueChange={(v) =>
                    form.setValue('fiscalYearStartMonth', Number(v), { shouldDirty: true })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MONTHS.map((month, i) => (
                      <SelectItem key={i + 1} value={String(i + 1)}>
                        {month}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {t('financial.fiscalYearStartMonthHint')}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="paymentTerms">{t('financial.paymentTerms')}</Label>
                <Input
                  id="paymentTerms"
                  type="number"
                  min={0}
                  max={365}
                  {...form.register('defaultPaymentTermsDays')}
                />
                <p className="text-xs text-muted-foreground">{t('financial.paymentTermsHint')}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Lock Date */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5" />
              {t('financial.lockDate')}
            </CardTitle>
            <CardDescription>{t('financial.lockDateDescription')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="flex-1">
                {settings?.financial?.lockDate ? (
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-sm">
                      {t('financial.lockedThrough', {
                        date: format(new Date(settings.financial.lockDate), 'MMMM d, yyyy'),
                      })}
                    </Badge>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">{t('financial.noLockDate')}</p>
                )}
              </div>
              <div className="flex gap-2">
                {settings?.financial?.lockDate ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleClearLockDate}
                    disabled={updateLockDate.isPending}
                  >
                    {t('financial.removeLock')}
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleSetLockDate}
                    disabled={updateLockDate.isPending}
                  >
                    {t('financial.lockPreviousMonth')}
                  </Button>
                )}
              </div>
            </div>
            <p className="text-xs text-muted-foreground">{t('financial.lockDateExplanation')}</p>
          </CardContent>
        </Card>

        {/* Save */}
        <div className="flex justify-end">
          <Button
            type="submit"
            disabled={updateFinancial.isPending || !form.formState.isDirty}
            className="gap-2"
          >
            <Save className="h-4 w-4" />
            {updateFinancial.isPending ? t('common.saving') : t('common.saveChanges')}
          </Button>
        </div>
      </form>
    </div>
  );
}
