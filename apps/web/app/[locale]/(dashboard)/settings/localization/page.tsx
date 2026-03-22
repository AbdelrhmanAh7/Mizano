'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
  useUpdateLocalizationSettings,
} from '@/lib/hooks/use-all-settings';
import { ArrowLeft, Globe, Save } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';

const DATE_FORMATS = [
  { value: 'MM/DD/YYYY', label: 'MM/DD/YYYY (US)' },
  { value: 'DD/MM/YYYY', label: 'DD/MM/YYYY (International)' },
  { value: 'YYYY-MM-DD', label: 'YYYY-MM-DD (ISO)' },
];

const NUMBER_FORMATS = [
  { value: '1,000.00', label: '1,000.00 (US/UK)' },
  { value: '1.000,00', label: '1.000,00 (European)' },
  { value: '1 000,00', label: '1 000,00 (French/International)' },
];

const TIMEZONES = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Asia/Dubai',
  'Asia/Riyadh',
  'Asia/Kolkata',
  'Asia/Shanghai',
  'Asia/Tokyo',
  'Australia/Sydney',
  'Africa/Cairo',
  'Africa/Nairobi',
];

interface FormData {
  dateFormat: string;
  numberFormat: string;
  timezone: string;
}

export default function LocalizationSettingsPage() {
  const t = useTranslations('settings');
  const { data: settings, isLoading } = useAllOrganizationSettings();
  const updateLocalization = useUpdateLocalizationSettings();

  const form = useForm<FormData>({
    defaultValues: {
      dateFormat: 'MM/DD/YYYY',
      numberFormat: '1,000.00',
      timezone: 'UTC',
    },
  });

  useEffect(() => {
    if (settings?.localization) {
      form.reset({
        dateFormat: settings.localization.dateFormat || 'MM/DD/YYYY',
        numberFormat: settings.localization.numberFormat || '1,000.00',
        timezone: settings.localization.timezone || 'UTC',
      });
    }
  }, [settings, form]);

  const onSubmit = (data: FormData) => {
    updateLocalization.mutate(data);
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="rounded-xl border bg-card p-6 space-y-4">
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
          <h1 className="text-2xl font-bold tracking-tight">{t('localization.title')}</h1>
          <p className="text-muted-foreground text-sm">{t('localization.description')}</p>
        </div>
      </div>

      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5" />
              {t('localization.displayFormat')}
            </CardTitle>
            <CardDescription>{t('localization.displayFormatDescription')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('localization.dateFormat')}</Label>
                <Select
                  value={form.watch('dateFormat')}
                  onValueChange={(v) => form.setValue('dateFormat', v, { shouldDirty: true })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DATE_FORMATS.map((f) => (
                      <SelectItem key={f.value} value={f.value}>
                        {f.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>{t('localization.numberFormat')}</Label>
                <Select
                  value={form.watch('numberFormat')}
                  onValueChange={(v) => form.setValue('numberFormat', v, { shouldDirty: true })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {NUMBER_FORMATS.map((f) => (
                      <SelectItem key={f.value} value={f.value}>
                        {f.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label>{t('localization.timezone')}</Label>
                <Select
                  value={form.watch('timezone')}
                  onValueChange={(v) => form.setValue('timezone', v, { shouldDirty: true })}
                >
                  <SelectTrigger className="max-w-md">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIMEZONES.map((tz) => (
                      <SelectItem key={tz} value={tz}>
                        {tz.replace(/_/g, ' ')}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Save */}
        <div className="flex justify-end">
          <Button
            type="submit"
            disabled={updateLocalization.isPending || !form.formState.isDirty}
            className="gap-2"
          >
            <Save className="h-4 w-4" />
            {updateLocalization.isPending ? t('common.saving') : t('common.saveChanges')}
          </Button>
        </div>
      </form>
    </div>
  );
}
