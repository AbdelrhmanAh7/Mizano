'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import {
  useAllOrganizationSettings,
  useUpdateBrandingSettings,
} from '@/lib/hooks/use-all-settings';
import { ArrowLeft, Palette, Save } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';

interface FormData {
  primaryColor: string;
  footerText: string;
}

export default function BrandingSettingsPage() {
  const t = useTranslations('settings');
  const { data: settings, isLoading } = useAllOrganizationSettings();
  const updateBranding = useUpdateBrandingSettings();

  const form = useForm<FormData>({
    defaultValues: {
      primaryColor: '#3B82F6',
      footerText: '',
    },
  });

  useEffect(() => {
    if (settings?.branding) {
      form.reset({
        primaryColor: settings.branding.primaryColor || '#3B82F6',
        footerText: settings.branding.footerText || '',
      });
    }
  }, [settings, form]);

  const onSubmit = (data: FormData) => {
    updateBranding.mutate(data);
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="rounded-xl border bg-card p-6 space-y-4">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-10 w-full" />
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
          <h1 className="text-2xl font-bold tracking-tight">{t('branding.title')}</h1>
          <p className="text-muted-foreground text-sm">{t('branding.description')}</p>
        </div>
      </div>

      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Palette className="h-5 w-5" />
              {t('branding.brandSettings')}
            </CardTitle>
            <CardDescription>{t('branding.brandSettingsDescription')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Primary Color */}
            <div className="space-y-2">
              <Label>{t('branding.primaryColor')}</Label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={form.watch('primaryColor')}
                  onChange={(e) =>
                    form.setValue('primaryColor', e.target.value, { shouldDirty: true })
                  }
                  className="h-10 w-14 cursor-pointer rounded border"
                />
                <Input
                  {...form.register('primaryColor')}
                  className="max-w-[140px] font-mono"
                  placeholder="#3B82F6"
                />
                {/* Preview */}
                <div
                  className="h-10 flex-1 rounded-lg flex items-center justify-center text-white text-sm font-medium"
                  style={{ backgroundColor: form.watch('primaryColor') }}
                >
                  {t('branding.preview')}
                </div>
              </div>
              <p className="text-xs text-muted-foreground">{t('branding.primaryColorHint')}</p>
            </div>

            {/* Logo note */}
            <div className="rounded-lg border p-4 bg-muted/30">
              <p className="text-sm text-muted-foreground">
                <strong>{t('branding.logoNote')}</strong> {t('branding.logoNoteDescription')}
              </p>
            </div>

            {/* Footer Text */}
            <div className="space-y-2">
              <Label htmlFor="footerText">{t('branding.footerText')}</Label>
              <Textarea
                id="footerText"
                {...form.register('footerText')}
                placeholder="Thank you for your business! Please contact us with any questions."
                rows={3}
              />
              <p className="text-xs text-muted-foreground">{t('branding.footerTextHint')}</p>
            </div>
          </CardContent>
        </Card>

        {/* Save */}
        <div className="flex justify-end">
          <Button
            type="submit"
            disabled={updateBranding.isPending || !form.formState.isDirty}
            className="gap-2"
          >
            <Save className="h-4 w-4" />
            {updateBranding.isPending ? t('common.saving') : t('common.saveChanges')}
          </Button>
        </div>
      </form>
    </div>
  );
}
