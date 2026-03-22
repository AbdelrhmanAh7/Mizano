'use client';

import { useEffect } from 'react';
import { ErrorState } from '@/components/shared/error-state';

export default function InventoryError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Inventory module error:', error.message);
  }, [error]);

  return <ErrorState error={error} title="Inventory Error" onRetry={reset} />;
}
