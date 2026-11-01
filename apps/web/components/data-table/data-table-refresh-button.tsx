'use client';

import { RefreshCw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';

/** The icon button next to a list's filters that loads the list again. */
export function DataTableRefreshButton({ onRefresh }: { onRefresh: () => void }): JSX.Element {
  const t = useTranslations('common');
  return (
    <Button variant="outline" size="icon" onClick={onRefresh} aria-label={t('buttons.refresh')}>
      <RefreshCw className="h-4 w-4" />
    </Button>
  );
}
