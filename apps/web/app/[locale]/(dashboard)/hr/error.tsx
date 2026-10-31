'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { ErrorState } from '@/components/shared/error-state';

export default function HrError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations('hr');
  useEffect(() => {
    console.error('HR module error:', error.message);
  }, [error]);

  return <ErrorState error={error} title={t('moduleError')} onRetry={reset} />;
}
