'use client';

import { useEffect } from 'react';
import { AlertCircle, RotateCcw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { BrandLogo } from '@/components/brand/brand-logo';

export default function LocaleError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations('common');
  useEffect(() => {
    console.error('Application error:', error.message, error.stack);
  }, [error]);

  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <div className="max-w-md w-full text-center space-y-4 p-6">
        <div className="flex justify-center">
          <BrandLogo height={32} alt={t('appName')} />
        </div>
        <div className="flex justify-center">
          <div className="rounded-full bg-red-100 dark:bg-red-900/20 p-3">
            <AlertCircle className="h-8 w-8 text-destructive" />
          </div>
        </div>
        <h1 className="text-2xl font-bold">{t('errors.generic')}</h1>
        <p className="text-muted-foreground">{error.message || t('errorPage.fallbackMessage')}</p>
        <Button onClick={reset} className="gap-2">
          <RotateCcw className="h-4 w-4" />
          {t('errors.tryAgain')}
        </Button>
      </div>
    </div>
  );
}
