'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { ErrorState } from '@/components/shared/error-state';

export default function BankingError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations('banking');
  useEffect(() => {
    console.error('Banking module error:', error.message);
  }, [error]);

  return <ErrorState error={error} title={t('errorTitle')} onRetry={reset} />;
}
