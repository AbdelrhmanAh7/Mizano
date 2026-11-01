'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { AlertCircle, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations('common');

  useEffect(() => {
    console.error('Dashboard error:', error.message, error.stack);
  }, [error]);

  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <Card className="max-w-md w-full">
        <CardContent className="pt-6 text-center space-y-4">
          <div className="flex justify-center">
            <div className="rounded-full bg-destructive/10 p-3">
              <AlertCircle className="h-6 w-6 text-destructive" />
            </div>
          </div>
          <div>
            <h2 className="text-lg font-semibold">{t('errors.generic')}</h2>
            <p className="text-sm text-muted-foreground mt-1">
              {error.message || t('errorPage.fallbackMessage')}
            </p>
            {error.digest && (
              <p className="text-xs text-muted-foreground mt-2 font-mono">
                {t('errorPage.errorId', { id: error.digest })}
              </p>
            )}
          </div>
          <Button onClick={reset} variant="outline" className="gap-2">
            <RotateCcw className="h-4 w-4" />
            {t('errors.tryAgain')}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
