'use client';

import { useEffect } from 'react';
import { ErrorState } from '@/components/shared/error-state';

export default function SalesError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Sales module error:', error.message);
  }, [error]);

  return <ErrorState error={error} title="Sales Error" onRetry={reset} />;
}
