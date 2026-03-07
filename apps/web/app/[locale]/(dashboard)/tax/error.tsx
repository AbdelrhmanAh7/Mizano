'use client';

import { useEffect } from 'react';
import { ErrorState } from '@/components/shared/error-state';

export default function TaxError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Tax module error:', error.message);
  }, [error]);

  return <ErrorState error={error} title="Tax Error" onRetry={reset} />;
}
