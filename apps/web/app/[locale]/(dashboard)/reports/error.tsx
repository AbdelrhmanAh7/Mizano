'use client';

import { useEffect } from 'react';
import { ErrorState } from '@/components/shared/error-state';

export default function ReportsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Reports module error:', error.message);
  }, [error]);

  return <ErrorState error={error} title="Reports Error" onRetry={reset} />;
}
