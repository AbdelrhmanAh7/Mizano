'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { getLocalizedApiErrorMessage } from '@/lib/api-error';
import {
  useAiFeature,
  useMonthlySummary,
  useWriteMonthlySummary,
} from '@/lib/hooks/use-ai-settings';
import { useDateFormatter } from '@/lib/hooks/use-date-locale';
import { Sparkles } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';

/**
 * The AI `summary` feature on the P&L page: a plain-language paragraph about one month, written
 * by the organization's own AI account. Hidden entirely when the feature is off.
 */
export function MonthlySummaryCard({ month }: { month: string }) {
  const t = useTranslations('reports.aiSummary');
  const tErrors = useTranslations('settings.aiErrors');
  const locale = useLocale();
  const feature = useAiFeature('summary');
  const summary = useMonthlySummary(month, feature.active);
  const write = useWriteMonthlySummary(month);
  const formatMonth = useDateFormatter('month');

  if (!feature.active) return null;

  const text = summary.data ? (locale === 'ar' ? summary.data.ar : summary.data.en) : null;
  // `month` is yyyy-MM; the title names it in the page language ("أكتوبر 2026").
  const [year, monthNumber] = month.split('-').map(Number);
  const monthLabel = formatMonth(new Date(year, monthNumber - 1, 1));

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4" />
            {t('title', { month: monthLabel })}
          </CardTitle>
          <CardDescription>{t('note')}</CardDescription>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={write.isPending || summary.isLoading}
          onClick={() => write.mutate()}
        >
          {write.isPending ? t('writing') : text ? t('rewrite') : t('write')}
        </Button>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {summary.isLoading && <Skeleton className="h-12 w-full" />}
        {summary.isError && (
          <p className="text-destructive">
            {t('loadFailed')}{' '}
            <Button
              variant="link"
              size="sm"
              className="h-auto p-0"
              onClick={() => summary.refetch()}
            >
              {t('retry')}
            </Button>
          </p>
        )}
        {write.isError && (
          <p role="alert" className="text-destructive">
            {getLocalizedApiErrorMessage(write.error, t('writeFailed'), tErrors)}
          </p>
        )}
        {text ? (
          <p className="leading-relaxed">{text}</p>
        ) : (
          !summary.isLoading &&
          !summary.isError && <p className="text-muted-foreground">{t('empty')}</p>
        )}
      </CardContent>
    </Card>
  );
}
