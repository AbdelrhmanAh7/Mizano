'use client';

import { useEffect } from 'react';
import { ErrorState } from '@/components/shared/error-state';

export default function AccountingError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Accounting module error:', error.message);
  }, [error]);

  return <ErrorState error={error} title="Accounting Error" onRetry={reset} />;
}
