'use client';

import { useEffect } from 'react';
import { ErrorState } from '@/components/shared/error-state';

export default function BankingError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Banking module error:', error.message);
  }, [error]);

  return <ErrorState error={error} title="Banking Error" onRetry={reset} />;
}
