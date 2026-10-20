'use client';

import React from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TelegramLinkManager } from '@/components/settings/telegram-link-manager';
import { useLocale } from 'next-intl';
import { localeDirections, type Locale } from '@/i18n/config';

export default function TelegramSettingsPage() {
  const t = useTranslations('settings.telegram');
  const locale = useLocale();
  const direction = localeDirections[locale as Locale];
  const isRtl = direction === 'rtl';

  return (
    <div className="space-y-6">
      {/* Header and Back navigation */}
      <div className="flex items-center gap-4">
        <Link href={`/${locale}/settings`}>
          <Button variant="ghost" size="icon" aria-label="Back to Settings">
            {isRtl ? <ArrowRight className="h-5 w-5" /> : <ArrowLeft className="h-5 w-5" />}
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
          <p className="text-sm text-muted-foreground">{t('description')}</p>
        </div>
      </div>

      {/* Main Telegram Link Management Component */}
      <TelegramLinkManager />
    </div>
  );
}
