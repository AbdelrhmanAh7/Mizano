'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

interface ReportLoadErrorProps {
  onRetry: () => void;
}

/** A failed report query is an error with Retry, never the report's "no data" empty state. */
export function ReportLoadError({ onRetry }: ReportLoadErrorProps): JSX.Element {
  const t = useTranslations('reports');

  return (
    <Card>
      <CardContent className="pt-6 text-center space-y-4" role="alert">
        <p className="text-muted-foreground">{t('loadError')}</p>
        <Button variant="outline" onClick={onRetry}>
          {t('retry')}
        </Button>
      </CardContent>
    </Card>
  );
}
