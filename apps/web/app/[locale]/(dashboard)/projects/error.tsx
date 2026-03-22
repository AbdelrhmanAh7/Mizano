'use client';

import { useEffect } from 'react';
import { ErrorState } from '@/components/shared/error-state';

export default function ProjectsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Projects module error:', error.message);
  }, [error]);

  return <ErrorState error={error} title="Projects Error" onRetry={reset} />;
}
