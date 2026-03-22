'use client';

import { useEffect } from 'react';
import { ErrorState } from '@/components/shared/error-state';

export default function CrmError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('CRM module error:', error.message);
  }, [error]);

  return <ErrorState error={error} title="CRM Error" onRetry={reset} />;
}
