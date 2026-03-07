'use client';

import { useEffect } from 'react';
import { ErrorState } from '@/components/shared/error-state';

export default function AiLabError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('AI Lab module error:', error.message);
  }, [error]);

  return <ErrorState error={error} title="AI Lab Error" onRetry={reset} />;
}
