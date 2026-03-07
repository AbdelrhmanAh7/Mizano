'use client';

import { useEffect } from 'react';
import { ErrorState } from '@/components/shared/error-state';

export default function HrError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('HR module error:', error.message);
  }, [error]);

  return <ErrorState error={error} title="HR Error" onRetry={reset} />;
}
