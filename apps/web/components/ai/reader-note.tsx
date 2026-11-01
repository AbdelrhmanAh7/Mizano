'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { DocumentIntakeResult } from '@/lib/hooks/use-ai-document-intake';

type ReaderFields = Pick<
  DocumentIntakeResult,
  'extractionMethod' | 'extractionProvider' | 'extractionModel' | 'aiFallbackReason'
>;

/**
 * Says which reader produced an intake result and, when the AI did not, why, with a link to the
 * AI settings. Results from before this field existed show nothing.
 */
export function ReaderNote({ result }: { result: ReaderFields }) {
  const t = useTranslations('ai.intake.scan.reader');
  const tProviders = useTranslations('settings.ai.providers');
  const tErrors = useTranslations('settings.aiErrors');
  if (!result.extractionMethod) return null;

  if (result.extractionMethod === 'ai') {
    const provider = result.extractionProvider ?? '';
    return (
      <p className="text-sm text-muted-foreground" data-testid="intake-reader">
        {t('ai', {
          provider: provider && tProviders.has(provider) ? tProviders(provider) : provider,
          model: result.extractionModel ?? '',
        })}
      </p>
    );
  }

  const reason = result.aiFallbackReason;
  let why: string | null = null;
  if (reason === 'AI_OFF') why = t('reasonAiOff');
  else if (reason === 'RULES_ONLY') why = t('reasonRulesOnly');
  else if (reason) {
    why = t('reasonError', {
      reason: tErrors.has(reason) ? tErrors(reason) : tErrors('AI_PROVIDER_ERROR'),
    });
  }

  return (
    <p className="text-sm text-muted-foreground" data-testid="intake-reader">
      {t('rules')} {why}{' '}
      <Link href="/settings/ai" className="text-primary underline-offset-4 hover:underline">
        {t('settings')}
      </Link>
    </p>
  );
}
