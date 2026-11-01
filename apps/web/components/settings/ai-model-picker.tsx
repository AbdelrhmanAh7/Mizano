'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { AiModel } from '@/lib/api/ai-settings';
import { getLocalizedApiErrorMessage } from '@/lib/api-error';
import { useChooseAiModel } from '@/lib/hooks/use-ai-settings';

/** A typical bill: about this many tokens in and out, for the price shown next to each model. */
const BILL_INPUT_TOKENS = 3000;
const BILL_OUTPUT_TOKENS = 800;
const MAX_SHOWN = 100;

export function isFree(m: AiModel): boolean {
  return (
    m.id.endsWith(':free') ||
    (m.pricePerMtok !== undefined &&
      Number(m.pricePerMtok[0]) === 0 &&
      Number(m.pricePerMtok[1]) === 0)
  );
}

/** USD for one typical bill, or null when the provider publishes no price. */
export function pricePerBill(m: AiModel): number | null {
  if (!m.pricePerMtok) return null;
  const [input, output] = m.pricePerMtok.map(Number);
  return (input * BILL_INPUT_TOKENS + output * BILL_OUTPUT_TOKENS) / 1_000_000;
}

export function filterModels(models: AiModel[], query: string, billsOnly: boolean): AiModel[] {
  const q = query.trim().toLowerCase();
  return models.filter(
    (m) =>
      (!billsOnly || m.vision !== false) &&
      (!q || m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q)),
  );
}

interface Props {
  models: AiModel[];
  current: string | null;
  disabled?: boolean;
}

/**
 * Pick the model from what the connected key can use. Choosing runs a real test call with it:
 * only a model that answers is saved; otherwise the old choice stays, the provider's reason is
 * shown and the next recommended options are offered.
 */
export function AiModelPicker({ models, current, disabled }: Props) {
  const t = useTranslations('settings.ai.picker');
  const tErrors = useTranslations('settings.aiErrors');
  const choose = useChooseAiModel();
  const [query, setQuery] = useState('');
  const [billsOnly, setBillsOnly] = useState(true);
  const [failure, setFailure] = useState<{
    model: string;
    code: string;
    suggestions: AiModel[];
  } | null>(null);
  const [networkError, setNetworkError] = useState<string | null>(null);

  const shown = useMemo(() => filterModels(models, query, billsOnly), [models, query, billsOnly]);

  const pick = (model: string) => {
    setFailure(null);
    setNetworkError(null);
    choose.mutate(model, {
      onSuccess: (result) => {
        if (!result.ok) setFailure({ model, code: result.code, suggestions: result.suggestions });
      },
      onError: (err) =>
        setNetworkError(getLocalizedApiErrorMessage(err, t('failedGeneric'), tErrors)),
    });
  };

  const reason = (code: string) =>
    tErrors.has(code) ? tErrors(code) : tErrors('AI_PROVIDER_ERROR');

  return (
    <div className="space-y-3" data-testid="ai-model-picker">
      <div className="flex flex-wrap items-center gap-4">
        <Input
          aria-label={t('search')}
          placeholder={t('search')}
          dir="ltr"
          className="max-w-xs"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="flex items-center gap-2">
          <Checkbox
            id="ai-bills-only"
            checked={billsOnly}
            onCheckedChange={(v) => setBillsOnly(v === true)}
          />
          <Label htmlFor="ai-bills-only" className="text-sm">
            {t('billsOnly')}
          </Label>
        </div>
      </div>

      {choose.isPending && (
        <p className="text-sm text-muted-foreground" role="status">
          {t('testing')}
        </p>
      )}

      <ul
        className="max-h-80 divide-y overflow-y-auto rounded-md border"
        data-testid="ai-model-list"
      >
        {shown.length === 0 && <li className="p-3 text-sm text-muted-foreground">{t('none')}</li>}
        {shown.slice(0, MAX_SHOWN).map((m) => {
          const bill = pricePerBill(m);
          const selected = m.id === current;
          return (
            <li key={m.id} className="flex flex-wrap items-center gap-2 p-3 text-sm">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{m.name}</p>
                <p className="truncate text-xs text-muted-foreground" dir="ltr">
                  {m.id}
                </p>
              </div>
              {m.recommended && <Badge>{t('recommended')}</Badge>}
              {isFree(m) && <Badge variant="secondary">{t('free')}</Badge>}
              <Badge variant="outline">
                {m.vision === undefined
                  ? t('visionUnknown')
                  : m.vision
                    ? t('visionYes')
                    : t('visionNo')}
              </Badge>
              <span className="text-xs text-muted-foreground" dir="ltr">
                {m.pricePerMtok
                  ? t('price', {
                      input: m.pricePerMtok[0],
                      output: m.pricePerMtok[1],
                      bill: (bill ?? 0).toFixed(4),
                    })
                  : t('priceUnknown')}
              </span>
              <Button
                size="sm"
                variant={selected ? 'secondary' : 'outline'}
                disabled={disabled || choose.isPending || selected}
                onClick={() => pick(m.id)}
                aria-label={`${selected ? t('selected') : t('use')} ${m.name}`}
              >
                {selected ? t('selected') : t('use')}
              </Button>
            </li>
          );
        })}
      </ul>
      {shown.length > MAX_SHOWN && (
        <p className="text-xs text-muted-foreground">
          {t('more', { count: shown.length - MAX_SHOWN })}
        </p>
      )}

      {failure && (
        <div
          className="rounded-md border border-destructive p-3 text-sm"
          role="alert"
          data-testid="ai-model-failed"
        >
          <p className="font-medium text-destructive">
            {t('failedTitle', { model: failure.model })}
          </p>
          <p>{reason(failure.code)}</p>
          <p className="text-xs text-muted-foreground">{t('kept', { model: current ?? '' })}</p>
          {failure.suggestions.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span>{t('tryNext')}</span>
              {failure.suggestions.map((s) => (
                <Button
                  key={s.id}
                  size="sm"
                  variant="outline"
                  disabled={choose.isPending}
                  onClick={() => pick(s.id)}
                >
                  {s.name}
                </Button>
              ))}
            </div>
          )}
        </div>
      )}
      {networkError && (
        <p className="text-sm text-destructive" role="alert">
          {networkError}
        </p>
      )}
    </div>
  );
}
