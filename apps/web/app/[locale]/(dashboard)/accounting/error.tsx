'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { ErrorState } from '@/components/shared/error-state';

export default function AccountingError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations('accounting');
  useEffect(() => {
    console.error('Accounting module error:', error.message);
  }, [error]);

  return <ErrorState error={error} title={t('errorTitle')} onRetry={reset} />;
}
