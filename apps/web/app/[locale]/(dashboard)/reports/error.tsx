'use client';

import { useTranslations } from 'next-intl';
import { ErrorState } from '@/components/shared/error-state';

export default function ReportsError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations('reports');

  return <ErrorState title={t('errorTitle')} retryLabel={t('retry')} onRetry={reset} />;
}
