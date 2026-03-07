'use client';

import { useEffect } from 'react';
import { ErrorState } from '@/components/shared/error-state';

export default function ManufacturingError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Manufacturing module error:', error.message);
  }, [error]);

  return <ErrorState error={error} title="Manufacturing Error" onRetry={reset} />;
}
