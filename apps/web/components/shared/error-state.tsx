'use client';

import { AlertCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ErrorStateProps {
  error?: Error & { digest?: string };
  /** Translated title; defaults to `common.errors.generic`. */
  title?: string;
  onRetry?: () => void;
  className?: string;
}

export function ErrorState({ error, title, onRetry, className }: ErrorStateProps) {
  const t = useTranslations('common.errors');
  return (
    <div className={cn('flex flex-col items-center justify-center py-12 text-center', className)}>
      <div className="rounded-full bg-destructive/10 p-4 mb-4">
        <AlertCircle className="h-8 w-8 text-destructive" />
      </div>
      <h3 className="text-lg font-semibold">{title ?? t('generic')}</h3>
      {error?.message && (
        <p className="text-sm text-muted-foreground mt-1 max-w-md">{error.message}</p>
      )}
      {onRetry && (
        <Button onClick={onRetry} variant="outline" className="mt-4">
          {t('tryAgain')}
        </Button>
      )}
    </div>
  );
}
