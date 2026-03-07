'use client';

import { useEffect } from 'react';
import { ErrorState } from '@/components/shared/error-state';

export default function AssetsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Assets module error:', error.message);
  }, [error]);

  return <ErrorState error={error} title="Assets Error" onRetry={reset} />;
}
