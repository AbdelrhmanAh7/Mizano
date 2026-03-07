'use client';

import { useEffect } from 'react';
import { ErrorState } from '@/components/shared/error-state';

export default function AiInsightsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('AI Insights module error:', error.message);
  }, [error]);

  return <ErrorState error={error} title="AI Insights Error" onRetry={reset} />;
}
