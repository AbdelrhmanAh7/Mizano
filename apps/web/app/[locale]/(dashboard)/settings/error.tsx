'use client';

import { useEffect } from 'react';
import { ErrorState } from '@/components/shared/error-state';

export default function SettingsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Settings module error:', error.message);
  }, [error]);

  return <ErrorState error={error} title="Settings Error" onRetry={reset} />;
}
