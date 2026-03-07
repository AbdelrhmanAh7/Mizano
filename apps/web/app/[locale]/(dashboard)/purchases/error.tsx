'use client';

import { useEffect } from 'react';
import { ErrorState } from '@/components/shared/error-state';

export default function PurchasesError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Purchases module error:', error.message);
  }, [error]);

  return <ErrorState error={error} title="Purchases Error" onRetry={reset} />;
}
