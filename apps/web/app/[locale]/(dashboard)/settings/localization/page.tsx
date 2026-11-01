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
  DOCUMENT_DIGITS,
  type DocumentDigits,
  useAllOrganizationSettings,
  useUpdateLocalizationSettings,
} from '@/lib/hooks/use-all-settings';
import { ArrowLeft, Globe, Save } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';

const DATE_FORMATS = [
  { value: 'MM/DD/YYYY', labelKey: 'localization.dateUs' },
  { value: 'DD/MM/YYYY', labelKey: 'localization.dateInternational' },
  { value: 'YYYY-MM-DD', labelKey: 'localization.dateIso' },
] as const;

const NUMBER_FORMATS = [
  { value: '1,000.00', labelKey: 'localization.numberUs' },
  { value: '1.000,00', labelKey: 'localization.numberEuropean' },
  { value: '1 000,00', labelKey: 'localization.numberFrench' },
] as const;

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

const DIGIT_LABEL_KEYS = {
  latn: 'localization.digitsLatn',
  arab: 'localization.digitsArab',
} as const satisfies Record<DocumentDigits, string>;

function isDocumentDigits(value: string): value is DocumentDigits {
  return (DOCUMENT_DIGITS as readonly string[]).includes(value);
}

interface FormData {
  dateFormat: string;
  numberFormat: string;
  timezone: string;
  documentDigits: DocumentDigits;
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
      documentDigits: 'latn',
    },
  });

  useEffect(() => {
    if (settings?.localization) {
      form.reset({
        dateFormat: settings.localization.dateFormat || 'MM/DD/YYYY',
        numberFormat: settings.localization.numberFormat || '1,000.00',
        timezone: settings.localization.timezone || 'UTC',
        documentDigits: settings.localization.documentDigits === 'arab' ? 'arab' : 'latn',
      });
    }
  }, [settings, form]);

  // Radix Select emits '' for a value missing from its options (also while it mounts); an empty
  // emission is never a choice, and saving it would fail the API's @IsIn for the whole form.
  const setChoice = (field: 'dateFormat' | 'numberFormat' | 'timezone', value: string) => {
    if (value) form.setValue(field, value, { shouldDirty: true });
  };

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
                  onValueChange={(v) => setChoice('dateFormat', v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DATE_FORMATS.map((f) => (
                      <SelectItem key={f.value} value={f.value}>
                        {t(f.labelKey)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>{t('localization.numberFormat')}</Label>
                <Select
                  value={form.watch('numberFormat')}
                  onValueChange={(v) => setChoice('numberFormat', v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {NUMBER_FORMATS.map((f) => (
                      <SelectItem key={f.value} value={f.value}>
                        {t(f.labelKey)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label>{t('localization.timezone')}</Label>
                <Select
                  value={form.watch('timezone')}
                  onValueChange={(v) => setChoice('timezone', v)}
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

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="documentDigits">{t('localization.documentDigits')}</Label>
                <Select
                  value={form.watch('documentDigits')}
                  onValueChange={(v) => {
                    if (isDocumentDigits(v))
                      form.setValue('documentDigits', v, { shouldDirty: true });
                  }}
                >
                  <SelectTrigger id="documentDigits" className="max-w-md">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DOCUMENT_DIGITS.map((digits) => (
                      <SelectItem key={digits} value={digits}>
                        {t(DIGIT_LABEL_KEYS[digits])}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-sm text-muted-foreground">
                  {t('localization.documentDigitsDescription')}
                </p>
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
